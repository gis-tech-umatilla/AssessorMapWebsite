const authGate = document.getElementById('authGate');
const authContent = document.getElementById('authContent');
const authErrorMsg = document.getElementById('authErrorMsg');
const userBadge = document.getElementById('userBadge');
const signOutBtn = document.getElementById('signOutBtn');

document.addEventListener('DOMContentLoaded', () => {
    renderAuthButtons();
    initAuthCheck();
});

function renderAuthButtons() {
    if (!authContent) return;

    const mode = (typeof AUTH_PROVIDER !== 'undefined' ? AUTH_PROVIDER : 'google').toLowerCase();
    const buttons = [];

    if (mode === 'google' || mode === 'both') {
        buttons.push(`
            <button id="googleSignInBtn" class="w-full flex items-center justify-center space-x-3 bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 px-4 border border-gray-300 rounded-xl shadow-sm cursor-pointer transition-all duration-150">
                <svg class="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 6.51l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Sign in with Google</span>
            </button>
        `);
    }

    if (mode === 'azure' || mode === 'microsoft' || mode === 'outlook' || mode === 'both') {
        buttons.push(`
            <button id="azureSignInBtn" class="w-full flex items-center justify-center space-x-3 bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 px-4 border border-gray-300 rounded-xl shadow-sm cursor-pointer transition-all duration-150">
                <svg class="w-5 h-5" viewBox="0 0 23 23">
                    <path fill="#f25022" d="M1 1h10v10H1z"/>
                    <path fill="#00a4ef" d="M1 12h10v10H1z"/>
                    <path fill="#7fba00" d="M12 1h10v10H12z"/>
                    <path fill="#ffb900" d="M12 12h10v10H12z"/>
                </svg>
                <span>Sign in with Outlook</span>
            </button>
        `);
    }

    authContent.innerHTML = `<div class="flex flex-col space-y-3">${buttons.join('')}</div>`;

    const googleBtn = document.getElementById('googleSignInBtn');
    const azureBtn = document.getElementById('azureSignInBtn');

    if (googleBtn) {
        googleBtn.addEventListener('click', () => startOAuthLogin('google'));
    }
    if (azureBtn) {
        // 'email' scope ensures Microsoft Entra ID always populates session.user.email
        azureBtn.addEventListener('click', () => startOAuthLogin('azure', 'email'));
    }
}

async function startOAuthLogin(provider, scopes = null) {
    const options = { redirectTo: window.location.href };
    if (scopes) options.scopes = scopes;

    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider,
        options
    });

    if (error && authErrorMsg) {
        authErrorMsg.innerText = "OAuth Error: " + error.message;
        authErrorMsg.classList.remove('hidden');
    }
}

async function initAuthCheck() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    evaluateUserSession(session);

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        evaluateUserSession(session);
    });
}

function getEmailPrefix(email) {
    if (!email) return 'unknown';
    return email.split('@')[0].toLowerCase();
}

function initializeRealtimeSync() {
    if (window.realtimeChannel) return;
    if (typeof supabaseClient === 'undefined') return;

    window.realtimeChannel = supabaseClient.channel('global-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'maps_registry' }, () => {
            if (typeof fetchMapsDirectory === 'function') fetchMapsDirectory();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'map_errors' }, () => {
            if (typeof fetchPins === 'function') fetchPins();
        })
        .subscribe();
}

function evaluateUserSession(session) {
    if (session && session.user) {
        const userEmail = (session.user.email || '').toLowerCase();
        const allowed = (typeof EXPLICIT_ALLOWED_EMAILS !== 'undefined' ? EXPLICIT_ALLOWED_EMAILS : [])
            .map(e => e.toLowerCase());

        if (userEmail && allowed.includes(userEmail)) {
            if (authGate) authGate.classList.add('hidden');
            if (userBadge) userBadge.innerText = userEmail;

            // 1. Issue Tracker (index.html): Direct triggers
            if (typeof fetchMapsDirectory === 'function') {
                fetchMapsDirectory();
            }
            if (typeof initializeRealtimeSync === 'function') {
                initializeRealtimeSync();
            }

            // 2. Comparison Tool (comparisontool.html): Event trigger
            window.dispatchEvent(new CustomEvent('auth:success', {
                detail: {
                    user: session.user,
                    email: userEmail,
                    prefix: getEmailPrefix(userEmail)
                }
            }));
        } else {
            if (authGate) authGate.classList.remove('hidden');
            if (authErrorMsg) {
                authErrorMsg.innerText = `Access Denied: ${userEmail || 'Account'} is not authorized.`;
                authErrorMsg.classList.remove('hidden');
            }
        }
    } else {
        if (authGate) authGate.classList.remove('hidden');
    }
}

if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.reload();
    });
}