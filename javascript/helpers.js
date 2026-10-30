// javascript/helpers.js

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

function getFormattedFirstName(prefix) {
    if (!prefix || prefix === 'unassigned') return 'Unassigned';
    const firstNameRaw = prefix.split('.')[0].toLowerCase();

    if (NAME_CASING_OVERRIDES[firstNameRaw]) {
        return NAME_CASING_OVERRIDES[firstNameRaw];
    }

    return firstNameRaw.charAt(0).toUpperCase() + firstNameRaw.slice(1);
}

// --- MAP SERVICE MODULE ---

window.MapService = {
    getFormattedFirstName,
    getUserTextColorClass,
    getUserColorStyle,

    sortReviewers(reviewersArr) {
        const order = window.REVIEWER_SORT_ORDER || [];
        return [...reviewersArr].sort((a, b) => {
            const indexA = order.indexOf(a);
            const indexB = order.indexOf(b);

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