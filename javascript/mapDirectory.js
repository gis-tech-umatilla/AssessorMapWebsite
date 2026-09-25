const pdfUpload = document.getElementById('pdfUpload');
const mapList = document.getElementById('mapList');

// Global trackers
let targetGroupIdOverride = null;
let isTargetOverrideTriggered = false;
let autoEditGroupId = null; // Tracks group ID that should auto-open in rename mode

pdfUpload.addEventListener('click', () => {
    if (!isTargetOverrideTriggered) {
        targetGroupIdOverride = null;
    }
    isTargetOverrideTriggered = false;
});

// --- HELPER TO TRIGGER INLINE GROUP NAME EDITING ---
function startEditingGroupName(group, groupHeader, titleTextSpan) {
    if (groupHeader.querySelector('input')) return; // Prevent duplicate inputs

    const renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.value = group.group_name;
    renameInput.className = "flex-1 bg-slate-800 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white font-bold tracking-wide outline-none focus:ring-1 focus:ring-blue-400 select-text";

    groupHeader.replaceChild(renameInput, titleTextSpan);

    setTimeout(() => {
        renameInput.focus();
        renameInput.select();
    }, 50);

    let isSaved = false;
    async function commitGroupNameChange() {
        if (isSaved) return;
        isSaved = true;

        const updatedValue = renameInput.value.trim();
        if (updatedValue && updatedValue !== group.group_name) {
            titleTextSpan.innerText = `📂 ${updatedValue}`;
            group.group_name = updatedValue;
            await supabaseClient
                .from('map_groups')
                .update({ group_name: updatedValue })
                .eq('id', group.id);
        } else {
            titleTextSpan.innerText = `📂 ${group.group_name}`;
        }

        if (groupHeader.contains(renameInput)) {
            groupHeader.replaceChild(titleTextSpan, renameInput);
        }
    }

    renameInput.addEventListener('keydown', (inputEvt) => {
        if (inputEvt.key === 'Enter') commitGroupNameChange();
        if (inputEvt.key === 'Escape') {
            renameInput.value = group.group_name;
            commitGroupNameChange();
        }
    });
    renameInput.addEventListener('blur', commitGroupNameChange);
}

// --- CUSTOM CONFIRM MODAL HELPER (PROMISE-BASED WITH DANGER STYLING) ---
function showCustomConfirm(title, message, confirmText = "Confirm", cancelText = "Cancel", isDanger = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('customConfirmModal');
        const titleEl = document.getElementById('modalTitle');
        const msgEl = document.getElementById('modalMessage');
        const confirmBtn = document.getElementById('modalConfirmBtn');
        const cancelBtn = document.getElementById('modalCancelBtn');

        titleEl.innerText = title;
        msgEl.innerHTML = message;
        confirmBtn.innerText = confirmText;
        cancelBtn.innerText = cancelText;

        if (isDanger) {
            confirmBtn.className = "flex-1 py-2 bg-[#543237] hover:bg-[#a50d15] text-red-100 hover:text-white border border-red-500/30 text-xs font-bold rounded-lg transition cursor-pointer shadow-md";
        } else {
            confirmBtn.className = "flex-1 py-2 bg-[#1985a1] hover:bg-[#1985a1]/80 text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-md";
        }

        modal.classList.remove('hidden');

        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            cleanup();
            resolve(false);
        };

        function cleanup() {
            modal.classList.add('hidden');
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        }

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
    });
}

function getUserColorStyle(prefix) {
    if (!prefix) return { bg: 'bg-slate-400', border: 'border-slate-500', text: 'text-white' };
    
    if (prefix === 'mckenzie.bowey') {
        return { bg: 'bg-[#e83a3a]', border: 'border-[#d12e2e]', text: 'text-white' };
    }
    if (prefix === 'ian.freel') {
        return { bg: 'bg-[#249fb3]', border: 'border-[#1b8294]', text: 'text-white' };
    }
    if (prefix === 'aspen.buckingham') {
        return { bg: 'bg-[#86ad32]', border: 'border-[#86ad32]', text: 'text-white' };
    }
    
    let hash = 0;
    for (let i = 0; i < prefix.length; i++) {
        hash = prefix.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const tailwindPalettes = [
        { bg: 'bg-indigo-600', border: 'border-indigo-700', text: 'text-white' },
        { bg: 'bg-amber-600', border: 'border-amber-700', text: 'text-white' },
        { bg: 'bg-purple-600', border: 'border-purple-700', text: 'text-white' },
        { bg: 'bg-cyan-600', border: 'border-cyan-700', text: 'text-white' },
        { bg: 'bg-fuchsia-600', border: 'border-fuchsia-700', text: 'text-white' }
    ];
    
    return tailwindPalettes[Math.abs(hash) % tailwindPalettes.length];
}

function getUserTextColorClass(prefix) {
    if (!prefix) return 'text-slate-300';
    if (prefix === 'mckenzie.bowey') return 'text-[#e83a3a]';
    if (prefix === 'ian.freel') return 'text-[#249fb3]';
    if (prefix === 'aspen.buckingham') return 'text-[#86ad32]';
    
    let hash = 0;
    for (let i = 0; i < prefix.length; i++) {
        hash = prefix.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const tailwindTextColors = [
        'text-indigo-400',
        'text-amber-400',
        'text-purple-400',
        'text-cyan-400',
        'text-fuchsia-400'
    ];
    
    return tailwindTextColors[Math.abs(hash) % tailwindTextColors.length];
}

function getFormattedFirstName(prefix) {
    if (!prefix) return 'Unassigned';
    const firstNameRaw = prefix.split('.')[0].toLowerCase();
    if (firstNameRaw === 'mckenzie') return 'McKenzie';
    return firstNameRaw.charAt(0).toUpperCase() + firstNameRaw.slice(1);
}

// --- PDF UPLOAD WITH OWNER-PREFIXED GROUPING ---
pdfUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const { data: authSession } = await supabaseClient.auth.getSession();
    if (!authSession || !authSession.session || !authSession.session.user) {
        await showCustomConfirm("Session Expired", "Please sign in again to continue.", "OK", "Dismiss");
        return;
    }
    const currentUserPrefix = getEmailPrefix(authSession.session.user.email);
    const userFirstName = getFormattedFirstName(currentUserPrefix);

    const cleanName = file.name.replace(/\s+/g, '_');
    const uniqueStoragePath = `public/${Date.now()}_${cleanName}`;
    placeholderText.innerHTML = `<p class='text-[#b3a98f] font-semibold animate-pulse'>Uploading ${file.name} to cloud servers...</p>`;

    const { data: storageData, error: storageErr } = await supabaseClient.storage.from('assessor-maps').upload(uniqueStoragePath, file);
    if (storageErr) {
        await showCustomConfirm("Upload Failed", storageErr.message, "OK", "Dismiss");
        return;
    }

    const { data: urlData } = supabaseClient.storage.from('assessor-maps').getPublicUrl(storageData.path);
    
    const [groupsRes, mapsRes] = await Promise.all([
        supabaseClient.from('map_groups').select('*').order('id', { ascending: true }),
        supabaseClient.from('maps_registry').select('*')
    ]);

    const allGroups = groupsRes.data || [];
    const allMaps = mapsRes.data || [];

    const userGroups = allGroups.filter(g => (g.created_by || '').toLowerCase() === currentUserPrefix.toLowerCase());

    let targetGroupId = null;
    let calculatedSortOrder = 0;

    // Direct Upload into Specific Folder
    if (targetGroupIdOverride !== null) {
        targetGroupId = targetGroupIdOverride;
        targetGroupIdOverride = null;
        calculatedSortOrder = allMaps.filter(m => m.group_id === targetGroupId).length;
    } else {
        const latestUserGroup = userGroups.length > 0 ? userGroups[userGroups.length - 1] : null;
        const latestUserGroupCount = latestUserGroup ? allMaps.filter(m => m.group_id === latestUserGroup.id).length : 0;

        if (latestUserGroup && latestUserGroupCount < 5) {
            targetGroupId = latestUserGroup.id;
            calculatedSortOrder = latestUserGroupCount;
        } else {
            let maxGroupNum = 0;
            userGroups.forEach(g => {
                const match = g.group_name.match(/\d+/);
                if (match) {
                    const num = parseInt(match[0], 10);
                    if (num > maxGroupNum) maxGroupNum = num;
                }
            });

            const nextGroupNum = maxGroupNum > 0 ? maxGroupNum + 1 : userGroups.length + 1;
            const uniqueGroupName = `${userFirstName} ${nextGroupNum}`;

            const { data: newGroup, error: gErr } = await supabaseClient
                .from('map_groups')
                .insert([{ 
                    group_name: uniqueGroupName,
                    sort_order: allGroups.length,
                    created_by: currentUserPrefix
                }])
                .select();
            
            if (gErr || !newGroup || newGroup.length === 0) {
                console.error("Group Creation Failed:", gErr ? gErr.message : "No data returned");
                await showCustomConfirm("Group Creation Error", (gErr ? gErr.message : "Database write error"), "OK", "Dismiss");
                pdfUpload.value = '';
                placeholderText.innerHTML = `<p class='text-red-500 font-semibold'>Group creation failed.</p>`;
                return;
            }

            targetGroupId = newGroup[0].id;
            autoEditGroupId = newGroup[0].id; // Flag group to auto-edit after map load completes
            calculatedSortOrder = 0;
        }
    }

    const { data: insertedData, error: insertErr } = await supabaseClient.from('maps_registry').insert([{ 
        map_name: file.name, 
        file_url: urlData.publicUrl,
        group_id: targetGroupId,
        sort_order: calculatedSortOrder
    }]).select();
    
    pdfUpload.value = ''; 
    
    if (insertErr) {
        console.error("Map Registry Failed:", insertErr.message);
        await showCustomConfirm("Map Registration Failed", insertErr.message, "OK", "Dismiss");
        return;
    }

    if (insertedData && insertedData.length > 0) {
        await fetchMapsDirectory();
        if (typeof loadActiveMap === 'function') {
            await loadActiveMap(insertedData[0]);
        }

        // Trigger inline edit mode AFTER map loading completes
        if (autoEditGroupId) {
            const pendingGroupId = autoEditGroupId;
            autoEditGroupId = null;
            setTimeout(() => {
                const groupContainer = document.querySelector(`.sortable-folder-item[data-group-id="${pendingGroupId}"]`);
                if (groupContainer && groupContainer._triggerRename) {
                    groupContainer._triggerRename();
                }
            }, 150);
        }
    }
});

// --- RENDER DIRECTORY ---
async function fetchMapsDirectory() {
    if (isSortingUpdateInProgress) return;

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;
    
    const currentUserEmail = session.user.email.toLowerCase();
    const currentUserPrefix = getEmailPrefix(currentUserEmail);

    const [groupsRes, mapsRes] = await Promise.all([
        supabaseClient.from('map_groups').select('*').order('sort_order', { ascending: true }),
        supabaseClient.from('maps_registry').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false })
    ]);

    if (mapsRes.error) return console.error(mapsRes.error);
    if (groupsRes.error) return console.error(groupsRes.error);
    
    const rawGroups = groupsRes.data || [];
    const rawMaps = mapsRes.data || [];

    mapList.innerHTML = '';

    if (rawGroups.length === 0 && rawMaps.length === 0) {
        mapList.innerHTML = '<p class="text-xs text-slate-300/60 italic p-2">No maps uploaded yet.</p>';
        return;
    }

    const mapsByGroupMap = {};
    rawMaps.forEach(map => {
        const gId = map.group_id || 'unassigned';
        if (!mapsByGroupMap[gId]) mapsByGroupMap[gId] = [];
        mapsByGroupMap[gId].push(map);
    });

    const groupsByCreator = {};
    rawGroups.forEach(group => {
        const creator = (group.created_by || 'unassigned').toLowerCase();
        if (!groupsByCreator[creator]) groupsByCreator[creator] = [];
        groupsByCreator[creator].push(group);
    });

    Object.keys(groupsByCreator).forEach(creatorPrefix => {
        const creatorGroups = groupsByCreator[creatorPrefix];
        if (creatorGroups.length === 0) return;

        const creatorName = getFormattedFirstName(creatorPrefix);
        const textColorClass = getUserTextColorClass(creatorPrefix);

        // Outer Super-Group Container Frame: #58646e
        const creatorSection = document.createElement('div');
        creatorSection.className = "bg-[#58646e] rounded-xl mb-3 border border-black/20 shadow-sm flex flex-col overflow-hidden";

        // Outer Super-Group Header Bar: #36424a
        const creatorHeader = document.createElement('div');
        creatorHeader.className = "bg-[#36424a] px-3 py-2 flex items-center justify-between border-b border-black/20 select-none";
        
        const creatorTitle = document.createElement('h3');
        creatorTitle.className = `text-sm font-extrabold tracking-wider ${textColorClass}`;
        creatorTitle.innerText = creatorName;

        creatorHeader.appendChild(creatorTitle);
        creatorSection.appendChild(creatorHeader);

        // Outer Super-Group Body Container
        const creatorBody = document.createElement('div');
        creatorBody.className = "p-2.5 flex flex-col space-y-2.5 sortable-folder-list";
        creatorBody.setAttribute('data-creator', creatorPrefix);

        // Inner Folders
        creatorGroups.forEach(group => {
            const groupMaps = mapsByGroupMap[group.id] || [];
            
            // Inner Folder Container: #44535d
            const groupContainer = document.createElement('div');
            groupContainer.className = "sortable-folder-item flex flex-col bg-[#44535d] rounded-lg overflow-hidden border border-black/20 text-slate-100 shadow-sm";
            groupContainer.setAttribute('data-group-id', group.id);
            groupContainer.setAttribute('data-creator', creatorPrefix);
            
            // Inner Folder Header: #36424a
            const groupHeader = document.createElement('div');
            groupHeader.className = "w-full flex justify-between items-center bg-[#36424a] p-2 text-xs font-bold text-slate-200 border-b border-black/20 select-none";
            
            if (creatorPrefix === currentUserPrefix) {
                const folderGrip = document.createElement('span');
                folderGrip.className = "sortable-folder-handle cursor-grab text-slate-400 hover:text-slate-200 text-xs font-bold tracking-tighter select-none shrink-0 pr-2";
                folderGrip.innerHTML = "☰";
                groupHeader.appendChild(folderGrip);
            }

            const titleTextSpan = document.createElement('span');
            titleTextSpan.className = "flex-1 tracking-wide py-0.5 truncate mr-2 cursor-pointer";
            titleTextSpan.innerText = `📂 ${group.group_name}`;
            groupHeader.appendChild(titleTextSpan);

            if (creatorPrefix === currentUserPrefix) {
                const delGroupBtn = document.createElement('button');
                delGroupBtn.className = "text-[10px] bg-red-950/50 hover:bg-red-700/80 text-red-300 hover:text-white px-1.5 py-0.5 rounded font-bold transition shrink-0 cursor-pointer select-none border border-red-500/20";
                delGroupBtn.innerText = "Delete";
                
                delGroupBtn.onclick = async (e) => {
                    e.stopPropagation();
                    
                    // If group has maps, query for unresolved issue counts
                    if (groupMaps.length > 0) {
                        const mapIds = groupMaps.map(m => m.id);
                        const { data: openErrors } = await supabaseClient
                            .from('map_errors')
                            .select('map_id')
                            .in('map_id', mapIds)
                            .eq('status', 'open');

                        const openCounts = {};
                        (openErrors || []).forEach(err => {
                            openCounts[err.map_id] = (openCounts[err.map_id] || 0) + 1;
                        });

                        const formattedMapNames = groupMaps
                            .map(m => {
                                const cleanName = m.map_name.replace(/\.(pdf|tif|tiff)$/i, '');
                                const count = openCounts[m.id] || 0;
                                const countBadge = count > 0 
                                    ? ` <span class="text-amber-400 font-semibold text-[11px]">(${count} unresolved issue${count === 1 ? '' : 's'})</span>` 
                                    : '';
                                return `<span class="font-bold text-slate-100">${cleanName}</span>${countBadge}`;
                            })
                            .join('<br>');

                        const confirmDelete = await showCustomConfirm(
                            `Delete Folder ${group.group_name}?`,
                            `Deleting "${group.group_name}" will delete all maps and marked issues.<br><br>${formattedMapNames}`,
                            "Delete",
                            "Cancel",
                            true
                        );
                        if (!confirmDelete) return;
                    }

                    // Perform deletion directly if empty, or after confirmation if populated
                    if (groupMaps.length > 0) {
                        const storagePaths = groupMaps
                            .map(m => m.file_url.split('/assessor-maps/'))
                            .filter(parts => parts.length > 1)
                            .map(parts => parts[1]);

                        if (storagePaths.length > 0) {
                            await supabaseClient.storage.from('assessor-maps').remove(storagePaths);
                        }

                        await supabaseClient.from('maps_registry').delete().eq('group_id', group.id);
                    }
                    
                    await supabaseClient.from('map_groups').delete().eq('id', group.id);

                    const wasActiveMapDeleted = groupMaps.some(m => m.id === currentMapId);
                    if (wasActiveMapDeleted) {
                        location.reload();
                    } else {
                        await fetchMapsDirectory();
                    }
                };
                groupHeader.appendChild(delGroupBtn);
            }
            
            groupContainer.appendChild(groupHeader);

            const childrenContentWrapper = document.createElement('div');
            childrenContentWrapper.className = "p-1 space-y-1 block min-h-[35px] sortable-map-list";
            childrenContentWrapper.setAttribute('data-group-id', group.id);
            childrenContentWrapper.setAttribute('data-creator', creatorPrefix);

            if (creatorPrefix === currentUserPrefix) {
                groupContainer._triggerRename = () => startEditingGroupName(group, groupHeader, titleTextSpan);

                titleTextSpan.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    startEditingGroupName(group, groupHeader, titleTextSpan);
                });
            }

            // Render Map Rows
            groupMaps.forEach((map) => {
                const mapRow = document.createElement('div');
                // Active Map: #1985a1 | Hover: #3d4b54
                mapRow.className = `group flex items-center p-1.5 rounded-md transition space-x-2 ${
                    currentMapId === map.id 
                        ? 'bg-[#1985a1] text-white shadow-md' 
                        : 'text-slate-200 hover:bg-[#3d4b54]'
                }`;
                mapRow.setAttribute('data-map-id', map.id);

                if (creatorPrefix === currentUserPrefix) {
                    const gripHandle = document.createElement('span');
                    gripHandle.className = "sortable-handle cursor-grab text-slate-400 hover:text-slate-200 text-xs font-bold tracking-tighter select-none shrink-0 pr-1";
                    gripHandle.innerHTML = "⋮⋮";
                    mapRow.appendChild(gripHandle);
                }

                const rowContentLayout = document.createElement('div');
                rowContentLayout.className = "flex-1 flex justify-between items-center min-w-0 cursor-pointer select-none";
                rowContentLayout.onclick = () => loadActiveMap(map);

                const cleanMapName = map.map_name.replace(/\.pdf$/i, '');
                const nameLabelSpan = document.createElement('span');
                nameLabelSpan.className = 'text-left text-xs font-medium truncate block min-w-0 pl-1 pr-2 pointer-events-none';
                nameLabelSpan.innerText = `📄 ${cleanMapName}`;
                rowContentLayout.appendChild(nameLabelSpan);

                const controlGroupContainer = document.createElement('div');
                controlGroupContainer.className = "flex items-center space-x-1 shrink-0";

                const reviewersArr = map.reviewed_by || [];
                const hasReviewed = reviewersArr.includes(currentUserPrefix);

                const sortedReviewers = [...reviewersArr].sort((a, b) => {
                    if (a === 'mckenzie.bowey') return -1;
                    if (b === 'mckenzie.bowey') return 1;
                    if (a === 'ian.freel') return -1;
                    if (b === 'ian.freel') return 1;
                    return a.localeCompare(b);
                });

                sortedReviewers.forEach((prefix) => {
                    const badge = document.createElement('button');
                    badge.className = "w-5 h-5 rounded-full border flex items-center justify-center text-[9px] font-bold tracking-widest shrink-0 cursor-pointer transition-all duration-150 relative saturate-85";
                    
                    const nameParts = prefix.split('.');
                    const initials = nameParts.length >= 2 
                        ? (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase()
                        : prefix.substring(0, 2).toUpperCase();

                    const colors = getUserColorStyle(prefix);
                    badge.className += ` ${colors.bg} ${colors.border} ${colors.text}`;
                    badge.innerText = initials;
                    badge.title = `Reviewed by ${prefix}. Click to remove your review.`;

                    badge.onclick = async (e) => {
                        e.stopPropagation();
                        let updatedReviewers = reviewersArr.filter(p => p !== prefix);
                        
                        if (prefix !== currentUserPrefix) {
                            if (hasReviewed) {
                                updatedReviewers = reviewersArr.filter(p => p !== currentUserPrefix);
                            } else {
                                updatedReviewers = [...reviewersArr, currentUserPrefix];
                            }
                        }

                        const { error } = await supabaseClient
                            .from('maps_registry')
                            .update({ reviewed_by: updatedReviewers })
                            .eq('id', map.id);
                        
                        if (!error) await fetchMapsDirectory();
                    };
                    controlGroupContainer.appendChild(badge);
                });

                if (!hasReviewed) {
                    const actionBtn = document.createElement('button');
                    actionBtn.className = "w-5 h-5 rounded-full border border-dashed border-slate-300/60 bg-transparent hover:border-white hover:bg-white/10 flex items-center justify-center shrink-0 cursor-pointer transition-all duration-150";
                    actionBtn.innerHTML = "&nbsp;";
                    actionBtn.title = "Mark as Reviewed";

                    actionBtn.onclick = async (e) => {
                        e.stopPropagation();
                        const updatedReviewers = [...reviewersArr, currentUserPrefix];

                        const { error } = await supabaseClient
                            .from('maps_registry')
                            .update({ reviewed_by: updatedReviewers })
                            .eq('id', map.id);
                        
                        if (!error) await fetchMapsDirectory();
                    };
                    controlGroupContainer.appendChild(actionBtn);
                }

                if (creatorPrefix === currentUserPrefix) {
                    const delBtn = document.createElement('button');
                    delBtn.className = `opacity-0 group-hover:opacity-100 px-1 py-0.5 bg-red-950/40 hover:bg-red-700/80 rounded text-red-300 hover:text-white transition text-[9px] cursor-pointer font-bold shrink-0 ml-1 border border-red-500/20`;
                    delBtn.innerHTML = 'Delete';
                    
                    delBtn.onclick = async (e) => {
                        e.stopPropagation();

                        const { data: openErrors } = await supabaseClient
                            .from('map_errors')
                            .select('id')
                            .eq('map_id', map.id)
                            .eq('status', 'open');

                        const count = (openErrors || []).length;
                        const countBadge = count > 0 
                            ? `<br><br><span class="text-amber-400 font-semibold text-[11px]">${count} unresolved issue${count === 1 ? '' : 's'}</span>`
                            : '';

                        const confirmDeletion = await showCustomConfirm(
                            `Delete ${cleanMapName}?`,
                            `Deleting "${cleanMapName}" will delete the map and all marked issues.${countBadge}`,
                            "Delete",
                            "Cancel",
                            true
                        );

                        if (confirmDeletion) {
                            const urlParts = map.file_url.split('/assessor-maps/');
                            if (urlParts.length > 1) await supabaseClient.storage.from('assessor-maps').remove([urlParts[1]]);
                            await supabaseClient.from('maps_registry').delete().eq('id', map.id);

                            if (currentMapId === map.id) {
                                currentMapId = null;
                                const mapWrapper = document.getElementById('mapWrapper');
                                if (mapWrapper) mapWrapper.classList.add('hidden');
                                if (placeholderText) {
                                    placeholderText.innerHTML = `
                                        <p class="text-lg font-bold opacity-80 text-[#4c5c68]">No Assessor Map Selected</p>
                                        <p class="text-sm text-slate-500 font-medium">Choose a Map From The Left Sidebar</p>
                                    `;
                                    placeholderText.classList.remove('hidden');
                                }
                                const toolbar = document.getElementById('drawingToolbar');
                                const zoomControls = document.getElementById('zoomControls');
                                if (toolbar) toolbar.classList.add('hidden');
                                if (zoomControls) zoomControls.classList.add('hidden');
                            }
                            await fetchMapsDirectory();
                        }
                    };
                    controlGroupContainer.appendChild(delBtn);
                }
                
                rowContentLayout.appendChild(controlGroupContainer);
                mapRow.appendChild(rowContentLayout);

                childrenContentWrapper.appendChild(mapRow);
            });

            // RENDER "UPLOAD" BUTTON IF GROUP HAS FEWER THAN 5 MAPS (OWNER ONLY)
            if (groupMaps.length < 5 && creatorPrefix === currentUserPrefix) {
                const emptyUploadBtn = document.createElement('button');
                emptyUploadBtn.className = "w-full py-1.5 px-2 bg-[#44535d] hover:bg-[#3d4b54] text-slate-300 hover:text-white text-xs font-semibold rounded border border-dashed border-white/20 transition cursor-pointer flex items-center justify-center my-0.5";
                emptyUploadBtn.innerText = "Upload";
                
                emptyUploadBtn.onclick = (e) => {
                    e.stopPropagation();
                    targetGroupIdOverride = group.id;
                    isTargetOverrideTriggered = true;
                    pdfUpload.click();
                };
                
                childrenContentWrapper.appendChild(emptyUploadBtn);
            }

            groupContainer.appendChild(childrenContentWrapper);
            creatorBody.appendChild(groupContainer);
        });

        // --- RENDER "+ GROUP" BUTTON INSIDE THE LOGGED-IN USER'S SUPER-GROUP ---
        if (creatorPrefix === currentUserPrefix) {
            const btnWrapper = document.createElement('div');
            btnWrapper.className = "flex justify-center w-full pt-1";

            const createGroupBtn = document.createElement('button');
            createGroupBtn.id = 'createNewGroupBtn';
            createGroupBtn.className = "inline-flex items-center space-x-1 px-3 py-1 rounded-md bg-[#4b5f70] hover:bg-[#3a4c59] border border-black/20 text-slate-100 text-xs font-semibold transition cursor-pointer shadow-xs";
            createGroupBtn.innerHTML = `<span class="text-sm font-bold leading-none">+</span><span>Group</span>`;

            createGroupBtn.onclick = async () => {
                const userGroups = rawGroups.filter(g => (g.created_by || '').toLowerCase() === currentUserPrefix.toLowerCase());
                const userFirstName = getFormattedFirstName(currentUserPrefix);

                let maxGroupNum = 0;
                userGroups.forEach(g => {
                    const match = g.group_name.match(/\d+/);
                    if (match) {
                        const num = parseInt(match[0], 10);
                        if (num > maxGroupNum) maxGroupNum = num;
                    }
                });

                const nextGroupNum = maxGroupNum > 0 ? maxGroupNum + 1 : userGroups.length + 1;
                const uniqueGroupName = `${userFirstName} ${nextGroupNum}`;

                const { data: newGroup, error: gErr } = await supabaseClient
                    .from('map_groups')
                    .insert([{ 
                        group_name: uniqueGroupName,
                        sort_order: rawGroups.length,
                        created_by: currentUserPrefix
                    }])
                    .select();

                if (gErr) {
                    console.error("Group Creation Failed:", gErr.message);
                    await showCustomConfirm("Group Creation Failed", gErr.message, "OK", "Dismiss");
                    return;
                }

                if (newGroup && newGroup.length > 0) {
                    autoEditGroupId = newGroup[0].id;
                }

                await fetchMapsDirectory();

                if (autoEditGroupId) {
                    const pendingGroupId = autoEditGroupId;
                    autoEditGroupId = null;
                    setTimeout(() => {
                        const groupContainer = document.querySelector(`.sortable-folder-item[data-group-id="${pendingGroupId}"]`);
                        if (groupContainer && groupContainer._triggerRename) {
                            groupContainer._triggerRename();
                        }
                    }, 100);
                }
            };

            btnWrapper.appendChild(createGroupBtn);
            creatorBody.appendChild(btnWrapper);
        }

        creatorSection.appendChild(creatorBody);
        mapList.appendChild(creatorSection);
    });
    
    initSortableDragAndDrop(currentUserPrefix);
}

// --- RESTRICTED DRAG AND DROP (GROUPS & MAPS) ---
function initSortableDragAndDrop(currentUserPrefix) {
    // 1. Enable folder/group reordering strictly inside active user's container
    const userFolderContainer = document.querySelector(`.sortable-folder-list[data-creator="${currentUserPrefix}"]`);
    if (userFolderContainer) {
        Sortable.create(userFolderContainer, {
            animation: 180,
            handle: '.sortable-folder-handle',
            draggable: '.sortable-folder-item',
            ghostClass: 'bg-[#1985a1]/20',
            onEnd: async function () {
                try {
                    isSortingUpdateInProgress = true;
                    const folderRows = userFolderContainer.querySelectorAll('.sortable-folder-item');
                    const folderUpdates = [];

                    folderRows.forEach((folder, newIdx) => {
                        const groupId = Number(folder.getAttribute('data-group-id'));
                        folderUpdates.push(
                            supabaseClient
                                .from('map_groups')
                                .update({ sort_order: newIdx })
                                .eq('id', groupId)
                        );
                    });

                    console.log(`[Batch Update] Reindexing ${folderUpdates.length} folders...`);
                    await Promise.all(folderUpdates);
                } catch (err) {
                    console.error("Folder sorting error:", err);
                } finally {
                    isSortingUpdateInProgress = false;
                    await fetchMapsDirectory();
                }
            }
        });
    }

    // 2. Enable map sheet reordering strictly inside active user's folders
    const lists = document.querySelectorAll('.sortable-map-list');
    lists.forEach(listEl => {
        const creator = listEl.getAttribute('data-creator');
        
        if (creator !== currentUserPrefix) return;

        Sortable.create(listEl, {
            group: `user-maps-${currentUserPrefix}`, 
            animation: 180,
            handle: '.sortable-handle',    
            draggable: '[data-map-id]', // Only map rows are reorderable (Upload button stays fixed)
            ghostClass: 'bg-[#1985a1]/20',
            
            onEnd: async function (evt) {
                const toListEl = evt.to;
                const fromListEl = evt.from;
                
                try {
                    isSortingUpdateInProgress = true;

                    const affectedLists = [toListEl];
                    if (fromListEl !== toListEl) {
                        affectedLists.push(fromListEl);
                    }

                    const updates = [];

                    for (const currentList of affectedLists) {
                        const listGroupIdRaw = currentList.getAttribute('data-group-id');
                        let listGroupId = (listGroupIdRaw !== 'unassigned' && listGroupIdRaw !== null) ? Number(listGroupIdRaw) : null;
                        
                        const childRows = currentList.querySelectorAll('[data-map-id]');
                        childRows.forEach((row, newIdx) => {
                            const mapId = Number(row.getAttribute('data-map-id'));
                            updates.push(
                                supabaseClient
                                    .from('maps_registry')
                                    .update({ 
                                        group_id: listGroupId, 
                                        sort_order: newIdx 
                                    })
                                    .eq('id', mapId)
                            );
                        });
                    }

                    console.log(`[Batch Update] Processing ${updates.length} map position updates...`);
                    await Promise.all(updates);
                } catch (err) {
                    console.error("Sortable map processing error:", err);
                } finally {
                    isSortingUpdateInProgress = false;
                    await fetchMapsDirectory();
                }
            }
        });
    });
}