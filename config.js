pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// Terminology used for maps across the website (singular form)
// Examples: 'Assessor Map' | 'Tax Map' | 'Cadastral Map' | 'Assessment Map' | 'Parcel Map' | 'GIS Map' | 'Plat Map'
const MAP_TERM = 'Assessor Map';

const SUPABASE_URL = "https://wsacgqykgmnsxzaqyvpn.supabase.co";
const SUPABASE_KEY = "sb_publishable_Tg79inBzykOOvoyN0ne1Jw_i7BpKu4D";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- AUTH & ROSTER SYSTEM CONTROLS ---
// Options: 'google' | 'azure' (Outlook / Microsoft 365) | 'both'
const AUTH_PROVIDER = 'google';

const DEFAULT_EMAIL_DOMAIN = '@umatillacounty.gov';

// --- ISSUE SIZE CONFIGURATION ---
const ISSUE_SIZES = {
    small: 10,    // Size in pixels (or your desired scale unit)
    medium: 24,   // Size in pixels (or your desired scale unit)
    large: 32     // Size in pixels (or your desired scale unit)
};

// Global default issue size setting ('small', 'medium', or 'large')
const DEFAULT_ISSUE_SIZE = 'medium';

// --- AUTH & ROSTER SYSTEM CONTROLS ---
const EXPLICIT_ALLOWED_EMAILS = [
    "ian.freel@umatillacounty.gov",
    "matthew.lynch@umatillacounty.gov",
    "mckenzie.bowey@umatillacounty.gov",
    "aspen.buckingham@umatillacounty.gov"
];

// Priority sorting order for reviewers (top to bottom)
const REVIEWER_SORT_ORDER = [
    'ian.freel',
    'matthew.lynch',
    'aspen.buckingham',
    'mckenzie.bowey'
];

// Centralized Single-Color Palette Mapping
const USER_COLORS = {
    'mckenzie.bowey': '#e83a3a',
    'ian.freel': '#249fb3',
    'aspen.buckingham': '#86ad32',
    'matthew.lynch': '#f7a414'
};

const NAME_CASING_OVERRIDES = {
    'ian.freel@umatillacounty.gov': 'Ian',
    'matthew.lynch@umatillacounty.gov': 'Matthew',
    'mckenzie.bowey@umatillacounty.gov': 'McKenzie',
    'aspen.buckingham@umatillacounty.gov': 'Aspen'
};

const REVIEWER_INITIALS = {
    'ian.freel@umatillacounty.gov': 'IF',
    'matthew.lynch@umatillacounty.gov': 'ML',
    'mckenzie.bowey@umatillacounty.gov': 'MB',
    'aspen.buckingham@umatillacounty.gov': 'AB'
};

const FALLBACK_USER_COLORS = [
    '#4f46e5', // Indigo
    '#9333ea', // Purple
    '#0891b2', // Cyan
    '#c026d3'  // Fuchsia
];


const GIS_LAYERS_REGISTRY = [
    "Abandoned Railroads",
    "Adjacent County Name/Stateline Text",
    "ArrowLine",
    "ArrowLine 400",
    "ArrowLine 2000",
    "ArrowLine 100",
    "ArrowLine 200",
    "Bearing And Distance",
    "Block Number",
    "Canal",
    "Canal Text",
    "Code Area Text",
    "Code Areas",
    "Conditions Of Approval",
    "Creek",
    "Creek Text",
    "CTUIR Boundary",
    "Easement CL",
    "Easement RW",
    "Easements",
    "Easement Text",
    "Government Lot Acerage",
    "Government Lot Number",
    "Judicial_Ppty_Decis",
    "PPL_Flume",
    "Lot Number/Parcel Number",
    "Map Index",
    "Map Index Text",
    "Misc Water Lines",
    "Misc Water Text",
    "Other Right Of Way Data Lines",
    "Other Right Of Way Data Text",
    "Parcel Hooks 100",
    "Parcel Hooks 200",
    "Parcel Hooks 400",
    "Parcel Hooks 2000",
    "Private Road Text",
    "Public Road Text",
    "Railroad Centerline",
    "Railroad Right Of Way",
    "Railroad Text",
    "Reference Notes",
    "River",
    "River Text",
    "Section Corner Tick",
    "Section Corner Tick 100",
    "Section Corner Tick 200",
    "Section Corner Tick 400",
    "Section Corner Tick 2000",
    "Section Number Text",
    "Stream Data",
    "Subdivision/Plats",
    "Subdivision/Plats Names",
    "Supplemental Boundary",
    "Tax Lot Acreage",
    "Tax Lot Number",
    "Tax Lots",
    "UmatillaRiver",
    "Vacation Ordinance Text",
    "Vacated Road",
    "Water Body Lines",
    "WaterBodyText"
];

// Not apart of config, don't touch!
window.REVIEWER_SORT_ORDER = REVIEWER_SORT_ORDER;
window.DEFAULT_EMAIL_DOMAIN = DEFAULT_EMAIL_DOMAIN;
window.NAME_CASING_OVERRIDES = NAME_CASING_OVERRIDES;
window.REVIEWER_INITIALS = REVIEWER_INITIALS;
window.getReviewerInitials = getReviewerInitials;