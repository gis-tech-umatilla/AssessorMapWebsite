function getMapTerm(plural = false) {
    const base = (typeof MAP_TERM !== 'undefined' && MAP_TERM.trim())
        ? MAP_TERM.trim()
        : 'Assessor Map';
    if (!plural) return base;
    return base.endsWith('s') ? base : `${base}s`;
}

window.getMapTerm = getMapTerm;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Update static HTML labels
    document.querySelectorAll('[data-map-term]').forEach(el => {
        const isPlural = el.getAttribute('data-map-term') === 'plural';
        el.textContent = getMapTerm(isPlural);
    });

    // 2. Safely update the browser tab title while preserving the specific tool's name
    if (document.title.includes('Assessor Map')) {
        document.title = document.title.replace('Assessor Map', getMapTerm(false));
    }
});

// --- SHARED GLOBAL STATE ---
let isSubmitting = false;
let currentMapId = null;
let activeErrors = [];
let panzoomInstance = null;
let pinsVisible = true;
let fixedPinsVisible = true;

let activeTool = 'view'; 
let firstPointClicked = null; 
let newlyCreatedPinId = null; 
let currentActivePopoverId = null;
let realtimeChannel = null;
let isSortingUpdateInProgress = false;
let sidebarScrollPosition = 0;
let lastClickTime = 0;

// --- USER & DISPLAY UTILITIES ---

function getUserHexColor(prefix) {
    if (!prefix) return '#94a3b8';
    const clean = prefix.replace(/@.*$/, '').toLowerCase().trim();
    
    if (USER_COLORS[clean]) {
        return USER_COLORS[clean];
    }
    
    for (const [key, val] of Object.entries(USER_COLORS)) {
        if (key.startsWith(clean) || clean.startsWith(key.split('.')[0])) {
            return val;
        }
    }
    
    let hash = 0;
    for (let i = 0; i < clean.length; i++) {
        hash = clean.charCodeAt(i) + ((hash << 5) - hash);
    }
    return FALLBACK_USER_COLORS[Math.abs(hash) % FALLBACK_USER_COLORS.length];
}

function getUserColorStyle(prefix) {
    const hex = getUserHexColor(prefix);
    return { 
        bg: `bg-[${hex}]`, 
        border: `border-[${hex}]`, 
        text: 'text-white',
        hex: hex 
    };
}

function getUserTextColorClass(prefix) {
    if (!prefix) return 'text-slate-300';
    const hex = getUserHexColor(prefix);
    return `text-[${hex}]`;
}

function getFormattedFirstName(identifier) {
    if (!identifier || identifier === 'unassigned') return 'Unassigned';

    const clean = String(identifier).toLowerCase().trim();

    if (typeof NAME_CASING_OVERRIDES !== 'undefined' && NAME_CASING_OVERRIDES) {
        // 1. Direct match (if a full email or exact key was passed)
        if (NAME_CASING_OVERRIDES[clean]) {
            return NAME_CASING_OVERRIDES[clean];
        }

        // 2. Prefix match using the configured DEFAULT_EMAIL_DOMAIN
        if (!clean.includes('@') && typeof DEFAULT_EMAIL_DOMAIN !== 'undefined' && DEFAULT_EMAIL_DOMAIN) {
            const domain = DEFAULT_EMAIL_DOMAIN.startsWith('@')
                ? DEFAULT_EMAIL_DOMAIN.toLowerCase().trim()
                : `@${DEFAULT_EMAIL_DOMAIN.toLowerCase().trim()}`;
            const fullEmail = `${clean}${domain}`;

            if (NAME_CASING_OVERRIDES[fullEmail]) {
                return NAME_CASING_OVERRIDES[fullEmail];
            }
        }

        // 3. Prefix match against any configured email key (supports multi-domain counties)
        if (!clean.includes('@')) {
            const matchedKey = Object.keys(NAME_CASING_OVERRIDES).find(
                key => key.toLowerCase().startsWith(`${clean}@`)
            );
            if (matchedKey) {
                return NAME_CASING_OVERRIDES[matchedKey];
            }
        }
    }

    // 4. Generic fallback for unmapped users
    const firstNameRaw = clean.split('@')[0].split('.')[0];
    return firstNameRaw.charAt(0).toUpperCase() + firstNameRaw.slice(1);
}

function formatDisplayName(identifier) {
    if (!identifier) return '';
    return getFormattedFirstName(identifier);
}

function getReviewerInitials(identifier) {
    if (!identifier) return '--';

    const clean = String(identifier).toLowerCase().trim();

    if (typeof REVIEWER_INITIALS !== 'undefined' && REVIEWER_INITIALS) {
        // 1. Direct match (full email or exact key)
        if (REVIEWER_INITIALS[clean]) {
            return REVIEWER_INITIALS[clean];
        }

        // 2. Prefix match using the configured DEFAULT_EMAIL_DOMAIN
        if (!clean.includes('@') && typeof DEFAULT_EMAIL_DOMAIN !== 'undefined' && DEFAULT_EMAIL_DOMAIN) {
            const domain = DEFAULT_EMAIL_DOMAIN.startsWith('@')
                ? DEFAULT_EMAIL_DOMAIN.toLowerCase().trim()
                : `@${DEFAULT_EMAIL_DOMAIN.toLowerCase().trim()}`;
            const fullEmail = `${clean}${domain}`;

            if (REVIEWER_INITIALS[fullEmail]) {
                return REVIEWER_INITIALS[fullEmail];
            }
        }

        // 3. Prefix match against any configured email key (multi-domain support)
        if (!clean.includes('@')) {
            const matchedKey = Object.keys(REVIEWER_INITIALS).find(
                key => key.toLowerCase().startsWith(`${clean}@`)
            );
            if (matchedKey) {
                return REVIEWER_INITIALS[matchedKey];
            }
        }
    }

    // 4. Generic fallback for unmapped users
    const cleanPrefix = clean.split('@')[0];
    const parts = cleanPrefix.split('.');
    return parts.length >= 2
        ? (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
        : cleanPrefix.substring(0, 2).toUpperCase();
}

// --- MAP SERVICE MODULE ---

window.MapService = {
    getFormattedFirstName,
    getUserTextColorClass,
    getUserColorStyle,
    getReviewerInitials,

    sortReviewers(reviewersArr) {
        const order = window.REVIEWER_SORT_ORDER || [];
        
        // Normalize: strip emails, remove whitespace, and lowercase
        const clean = (val) => (val || '').toString().replace(/@.*$/, '').trim().toLowerCase();

        return [...reviewersArr].sort((a, b) => {
            const indexA = order.indexOf(clean(a));
            const indexB = order.indexOf(clean(b));

            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.localeCompare(b);
        });
    },

    getReviewerInitials(prefix) {
        if (!prefix) return '--';
        const parts = prefix.split('.');
        return parts.length >= 2 
            ? (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase() 
            : prefix.substring(0, 2).toUpperCase();
    },

    async getOrganizedDirectory(currentUserPrefix = '') {
        const [groupsRes, mapsRes] = await Promise.all([
            supabaseClient.from('map_groups').select('*').order('sort_order', { ascending: true }),
            supabaseClient.from('maps_registry').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false })
        ]);

        if (groupsRes.error) console.error(groupsRes.error);
        if (mapsRes.error) console.error(mapsRes.error);

        const rawGroups = groupsRes.data || [];
        const rawMaps = mapsRes.data || [];

        const mapsByGroup = {};
        rawMaps.forEach(map => {
            const gId = map.group_id || 'unassigned';
            if (!mapsByGroup[gId]) mapsByGroup[gId] = [];
            mapsByGroup[gId].push(map);
        });

        const groupsByCreator = {};
        rawGroups.forEach(group => {
            const creator = (group.created_by || 'unassigned').toLowerCase();
            if (!groupsByCreator[creator]) groupsByCreator[creator] = [];
            groupsByCreator[creator].push(group);
        });

        const sortedCreators = Object.keys(groupsByCreator).sort((a, b) => {
            if (a === currentUserPrefix) return -1;
            if (b === currentUserPrefix) return 1;
            return this.getFormattedFirstName(a).localeCompare(this.getFormattedFirstName(b));
        });

        return {
            rawMaps,
            rawGroups,
            tree: sortedCreators.map(creatorPrefix => ({
                creatorPrefix,
                creatorName: this.getFormattedFirstName(creatorPrefix),
                textColorClass: this.getUserTextColorClass(creatorPrefix),
                groups: groupsByCreator[creatorPrefix].map(group => ({
                    id: group.id,
                    name: group.group_name,
                    maps: mapsByGroup[group.id] || []
                }))
            }))
        };
    }
};

// Window bindings for script modularity
window.USER_COLORS = USER_COLORS;
window.FALLBACK_USER_COLORS = FALLBACK_USER_COLORS;
window.getUserHexColor = getUserHexColor;
window.getUserColorStyle = getUserColorStyle;
window.getUserTextColorClass = getUserTextColorClass;
window.getFormattedFirstName = getFormattedFirstName;