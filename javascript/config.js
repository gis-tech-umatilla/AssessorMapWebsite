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