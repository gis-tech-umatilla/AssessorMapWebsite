const authGate = document.getElementById('authGate');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const authErrorMsg = document.getElementById('authErrorMsg');
const userBadge = document.getElementById('userBadge');
const signOutBtn = document.getElementById('signOutBtn');

// Ensure all script files are parsed into global scope before running auth check
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
    if (!email) return 'Unknown';
    return email.split('@')[0].toLowerCase();
}

function evaluateUserSession(session) {
    if (session && session.user) {
        const userEmail = session.user.email.toLowerCase();
        const isPermitted = EXPLICIT_ALLOWED_EMAILS.map(e => e.toLowerCase()).includes(userEmail);

        if (isPermitted) {
            authGate.classList.add('hidden');
            userBadge.innerText = userEmail;
            authErrorMsg.classList.add('hidden');
            fetchMapsDirectory();
            initializeRealtimeSync();
        } else {
            authGate.classList.remove('hidden');
            authErrorMsg.innerText = `Access Denied: ${userEmail} is not authorized to use this tool.`;
            authErrorMsg.classList.remove('hidden');
            userBadge.innerText = "";
        }
    } else {
        authGate.classList.remove('hidden');
        userBadge.innerText = "";
        if (realtimeChannel) {
            supabaseClient.removeChannel(realtimeChannel);
            realtimeChannel = null;
        }
    }
}

function initializeRealtimeSync() {
    if (realtimeChannel) return;
    realtimeChannel = supabaseClient.channel('global-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'maps_registry' }, () => fetchMapsDirectory())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'map_errors' }, () => fetchPins())
        .subscribe();
}

googleSignInBtn.addEventListener('click', async () => {
    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'https://gis-tech-umatilla.github.io/AssessorMapWebsite/' }
    });
    if (error) {
        authErrorMsg.innerText = "OAuth Error: " + error.message;
        authErrorMsg.classList.remove('hidden');
    }
});

signOutBtn.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.reload();
});