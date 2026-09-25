pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

const SUPABASE_URL = "https://wsacgqykgmnsxzaqyvpn.supabase.co";
const SUPABASE_KEY = "sb_publishable_Tg79inBzykOOvoyN0ne1Jw_i7BpKu4D";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- AUTH & ROSTER SYSTEM CONTROLS ---
const EXPLICIT_ALLOWED_EMAILS = [
    "ian.freel@umatillacounty.gov",
    "matthew.lynch@umatillacounty.gov",
    "mckenzie.bowey@umatillacounty.gov",
    "aspen.buckingham@umatillacounty.gov"
];

const GIS_LAYERS_REGISTRY = [
    "Adjacent County Name/Stateline Text", "Bearing And Distance", "Block Number",
    "Canal Text", "Code Area Text", "Conditions Of Approval", "Creek Text",
    "Easement Text", "Government Lot Acerage", "Government Lot Number",
    "Map Index Text", "Lot Number/Parcel Number", "Misc Water Text",
    "Other Right Of Way Data Text", "Private Road Text", "Public Road Text",
    "Railroad Text", "Reference Notes", "River Text", "Section Number",
    "Subdivision/Plat Name", "Tax Lot Acreage", "Tax Lot Number",
    "Vacation Ordinance Text", "Water Body Text"
];

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

// Centralized Single-Color Palette Mapping
const USER_COLORS = {
    'mckenzie.bowey': '#e83a3a',
    'ian.freel': '#249fb3',
    'aspen.buckingham': '#86ad32',
    'matthew.lynch': '#f7a414'
};

const FALLBACK_USER_COLORS = [
    '#4f46e5', // Indigo
    '#d97706', // Amber
    '#9333ea', // Purple
    '#0891b2', // Cyan
    '#c026d3'  // Fuchsia
];

/**
 * Returns the primary single hex color for a user.
 */
function getUserHexColor(prefix) {
    if (!prefix) return '#94a3b8'; // Default Slate-400
    const key = prefix.toLowerCase();
    
    if (USER_COLORS[key]) {
        return USER_COLORS[key];
    }
    
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = key.charCodeAt(i) + ((hash << 5) - hash);
    }
    return FALLBACK_USER_COLORS[Math.abs(hash) % FALLBACK_USER_COLORS.length];
}

/**
 * Returns element style classes where bg and border match the primary user color, with white text.
 */
function getUserColorStyle(prefix) {
    const hex = getUserHexColor(prefix);
    return { 
        bg: `bg-[${hex}]`, 
        border: `border-[${hex}]`, 
        text: 'text-white',
        hex: hex 
    };
}

/**
 * Returns Tailwind class for text colored with the user's primary color.
 */
function getUserTextColorClass(prefix) {
    if (!prefix) return 'text-slate-300';
    const hex = getUserHexColor(prefix);
    return `text-[${hex}]`;
}

/**
 * Formats user email prefix to display first name (e.g. ian.freel -> Ian).
 */
function getFormattedFirstName(prefix) {
    if (!prefix) return 'Unassigned';
    const firstNameRaw = prefix.split('.')[0].toLowerCase();
    if (firstNameRaw === 'mckenzie') return 'McKenzie';
    return firstNameRaw.charAt(0).toUpperCase() + firstNameRaw.slice(1);
}