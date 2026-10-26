const authGate = document.getElementById('authGate');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const authErrorMsg = document.getElementById('authErrorMsg');
const userBadge = document.getElementById('userBadge');
const signOutBtn = document.getElementById('signOutBtn');

document.addEventListener('DOMContentLoaded', () => {
    initAuthCheck();
});

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
        const userEmail = session.user.email.toLowerCase();
        const allowed = (typeof EXPLICIT_ALLOWED_EMAILS !== 'undefined' ? EXPLICIT_ALLOWED_EMAILS : [])
            .map(e => e.toLowerCase());

        if (allowed.includes(userEmail)) {
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
                authErrorMsg.innerText = `Access Denied: ${userEmail} is not authorized.`;
                authErrorMsg.classList.remove('hidden');
            }
        }
    } else {
        if (authGate) authGate.classList.remove('hidden');
    }
}

if (googleSignInBtn) {
    googleSignInBtn.addEventListener('click', async () => {
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.href }
        });
        if (error && authErrorMsg) {
            authErrorMsg.innerText = "OAuth Error: " + error.message;
            authErrorMsg.classList.remove('hidden');
        }
    });
}

if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.reload();
    });
}