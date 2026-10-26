window.MapService = {
    getFormattedFirstName(prefix) {
        if (!prefix || prefix === 'unassigned') return 'Unassigned';
        const firstName = prefix.split('.')[0];
        return firstName.charAt(0).toUpperCase() + firstName.slice(1);
    },

    getUserTextColorClass(prefix) {
        if (prefix === 'mckenzie.bowey') return 'text-[#ff6467]';
        if (prefix === 'ian.freel') return 'text-[#249fb3]';
        if (prefix === 'aspen.buckingham') return 'text-[#86ad32]';
        if (prefix === 'matthew.lynch') return 'text-indigo-400';
        return 'text-slate-200';
    },

    getUserColorStyle(prefix) {
        if (!prefix) return { bg: 'bg-slate-400', border: 'border-slate-500', text: 'text-white' };
        if (prefix === 'mckenzie.bowey') return { bg: 'bg-[#e83a3a]', border: 'border-[#d12e2e]', text: 'text-white' };
        if (prefix === 'ian.freel') return { bg: 'bg-[#249fb3]', border: 'border-[#1b8294]', text: 'text-white' };
        if (prefix === 'aspen.buckingham') return { bg: 'bg-[#86ad32]', border: 'border-[#86ad32]', text: 'text-white' };
        if (prefix === 'matthew.lynch') return { bg: 'bg-indigo-600', border: 'border-indigo-700', text: 'text-white' };
        
        let hash = 0;
        for (let i = 0; i < prefix.length; i++) hash = prefix.charCodeAt(i) + ((hash << 5) - hash);
        const palettes = [
            { bg: 'bg-indigo-600', border: 'border-indigo-700', text: 'text-white' },
            { bg: 'bg-amber-600', border: 'border-amber-700', text: 'text-white' },
            { bg: 'bg-purple-600', border: 'border-purple-700', text: 'text-white' },
            { bg: 'bg-cyan-600', border: 'border-cyan-700', text: 'text-white' }
        ];
        return palettes[Math.abs(hash) % palettes.length];
    },

    sortReviewers(reviewersArr) {
        return [...reviewersArr].sort((a, b) => {
            if (a === 'mckenzie.bowey') return -1;
            if (b === 'mckenzie.bowey') return 1;
            if (a === 'ian.freel') return -1;
            if (b === 'ian.freel') return 1;
            if (a === 'matthew.lynch') return -1;
            if (b === 'matthew.lynch') return 1;
            if (a === 'aspen.buckingham') return -1;
            if (b === 'aspen.buckingham') return 1;
            return a.localeCompare(b);
        });
    },

    getReviewerInitials(prefix) {
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