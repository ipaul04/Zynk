document.addEventListener('DOMContentLoaded', async () => {
    // ============================================
    // Authentication Check
    // ============================================
    const API_BASE_URL_CORE = 'http://localhost:3000';
    const API_LOGIN_URL = `${API_BASE_URL_CORE}/login`;
    
    // Check for token in URL and save it
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    if (tokenFromUrl) {
        sessionStorage.setItem('authToken', tokenFromUrl);
        // Clean up URL without reloading
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }

    let authToken = sessionStorage.getItem('authToken');
    let loggedInUserStr = sessionStorage.getItem('loggedInUser');

    if (!authToken) {
        window.location.href = API_LOGIN_URL;
        return;
    }

    // If we have a token but no user info, fetch it from the API
    if (authToken && !loggedInUserStr) {
        try {
            const response = await fetch(`${API_BASE_URL_CORE}/verify_token?token=${authToken}`);
            if (response.ok) {
                const data = await response.json();
                if (data.user) {
                    console.log('Fetched user info:', data.user);
                    sessionStorage.setItem('loggedInUser', JSON.stringify(data.user));
                    loggedInUserStr = JSON.stringify(data.user);
                    currentUser = data.user;
                    // Re-initialize UI after fetching
                    initializeUserInfo();
                }
            } else {
                // Token invalid
                sessionStorage.removeItem('authToken');
                window.location.href = API_LOGIN_URL;
                return;
            }
        } catch (error) {
            console.error('Failed to verify token:', error);
        }
    }

    let currentUser = { email: 'user@university.edu', name: 'User' };
    if (loggedInUserStr) {
        try {
            currentUser = JSON.parse(loggedInUserStr);
        } catch (error) {
            console.error('Failed to parse user data:', error);
        }
    }

    // ============================================
    // Data Store (using localStorage for persistence)
    // ============================================
    const STORAGE_KEYS = {
        MEETINGS: 'zynk1_meetings',
        NOTES: 'zynk1_notes',
        SELECTED_COURSES: 'zynk1_selected_courses'
    };

    function loadData(key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    }

    function saveData(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }

    let meetings = loadData(STORAGE_KEYS.MEETINGS);
    let notes = loadData(STORAGE_KEYS.NOTES);
    let selectedCourses = loadData(STORAGE_KEYS.SELECTED_COURSES);

    // ============================================
    // Sample Course Data
    // ============================================
    const availableCourses = [
        { code: 'CS 101', name: 'Introduction to Computer Science', credits: 3, days: ['M', 'W', 'F'], startTime: '09:00', endTime: '09:50', room: 'CS 101' },
        { code: 'CS 201', name: 'Data Structures', credits: 3, days: ['T', 'Th'], startTime: '10:00', endTime: '11:15', room: 'CS 205' },
        { code: 'CS 301', name: 'Algorithms', credits: 3, days: ['M', 'W', 'F'], startTime: '11:00', endTime: '11:50', room: 'CS 301' },
        { code: 'CS 350', name: 'Database Systems', credits: 3, days: ['T', 'Th'], startTime: '13:00', endTime: '14:15', room: 'CS 210' },
        { code: 'CS 401', name: 'Software Engineering', credits: 3, days: ['M', 'W'], startTime: '14:00', endTime: '15:15', room: 'CS 105' },
        { code: 'MATH 201', name: 'Calculus II', credits: 4, days: ['M', 'T', 'W', 'Th'], startTime: '08:00', endTime: '08:50', room: 'MATH 110' },
        { code: 'MATH 301', name: 'Linear Algebra', credits: 3, days: ['T', 'Th'], startTime: '15:00', endTime: '16:15', room: 'MATH 215' },
        { code: 'PHYS 201', name: 'Physics I', credits: 4, days: ['M', 'W', 'F'], startTime: '13:00', endTime: '13:50', room: 'PHYS 100' },
        { code: 'ENG 101', name: 'English Composition', credits: 3, days: ['T', 'Th'], startTime: '11:30', endTime: '12:45', room: 'HUM 205' },
        { code: 'HIST 101', name: 'World History', credits: 3, days: ['M', 'W', 'F'], startTime: '10:00', endTime: '10:50', room: 'HUM 110' }
    ];

    // ============================================
    // UI Elements
    // ============================================
    const userAvatarEl = document.getElementById('userAvatar');
    const userNameEl = document.getElementById('userName');
    const userRoleEl = document.getElementById('userRole');
    const logoutButton = document.getElementById('logoutButton');

    // Stats
    const statMeetingsEl = document.getElementById('statMeetings');
    const statCreditsEl = document.getElementById('statCredits');
    const statNotesEl = document.getElementById('statNotes');

    // Navigation
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    const pageSections = document.querySelectorAll('.page-section');

    // Modals
    const meetingModal = document.getElementById('meetingModal');
    const noteModal = document.getElementById('noteModal');

    // ============================================
    // Initialize User Info
    // ============================================
    function initializeUserInfo() {
        const name = currentUser.name || currentUser.email?.split('@')[0] || 'User';
        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

        if (userAvatarEl) userAvatarEl.textContent = initials || '--';
        if (userNameEl) userNameEl.textContent = name;
        if (userRoleEl) {
            const role = currentUser.role || 'Student';
            userRoleEl.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        }
    }

    // ============================================
    // Navigation
    // ============================================
    function switchPage(pageName) {
        // Update nav items
        navItems.forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageName);
        });

        // Update page sections
        pageSections.forEach(section => {
            section.classList.toggle('active', section.id === `page-${pageName}`);
        });
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            switchPage(item.dataset.page);
        });
    });

    // ============================================
    // Quick Actions
    // ============================================
    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            switch (action) {
                case 'schedule-meeting':
                    openMeetingModal();
                    break;
                case 'new-note':
                    openNoteModal();
                    break;
                case 'view-schedule':
                    switchPage('schedule');
                    break;
                case 'degree-audit':
                    alert('Degree audit feature coming soon!');
                    break;
            }
        });
    });

    // ============================================
    // Modal Management
    // ============================================
    function openModal(modal) {
        modal.classList.add('active');
    }

    function closeModal(modal) {
        modal.classList.remove('active');
    }

    // Close modal buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.dataset.closeModal;
            const modal = document.getElementById(modalId);
            if (modal) closeModal(modal);
        });
    });

    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal(overlay);
            }
        });
    });

    // ============================================
    // Meetings Management
    // ============================================
    function openMeetingModal() {
        // Set default date to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        document.getElementById('meetingDate').value = tomorrow.toISOString().split('T')[0];
        document.getElementById('meetingTime').value = '10:00';
        document.getElementById('meetingForm').reset();
        openModal(meetingModal);
    }

    document.getElementById('scheduleMeetingBtn')?.addEventListener('click', openMeetingModal);

    document.getElementById('saveMeetingBtn').addEventListener('click', () => {
        const type = document.getElementById('meetingType').value;
        const date = document.getElementById('meetingDate').value;
        const time = document.getElementById('meetingTime').value;
        const duration = document.getElementById('meetingDuration').value;
        const notes = document.getElementById('meetingNotes').value;

        if (!date || !time) {
            alert('Please select a date and time');
            return;
        }

        const meeting = {
            id: Date.now(),
            type,
            date,
            time,
            duration: parseInt(duration),
            notes,
            createdAt: new Date().toISOString()
        };

        meetings.push(meeting);
        saveData(STORAGE_KEYS.MEETINGS, meetings);
        closeModal(meetingModal);
        renderMeetings();
        updateStats();
    });

    function renderMeetings() {
        const upcomingList = document.getElementById('upcomingMeetingsList');
        const allList = document.getElementById('allMeetingsList');

        const now = new Date();
        const upcomingMeetings = meetings
            .filter(m => new Date(`${m.date}T${m.time}`) >= now)
            .sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));

        const meetingTypeLabels = {
            'advisement': 'Academic Advisement',
            'course-planning': 'Course Planning',
            'career': 'Career Discussion',
            'other': 'Other'
        };

        function renderMeetingList(container, meetingList, limit = null) {
            if (meetingList.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <h4>No meetings scheduled</h4>
                        <p>Schedule a meeting with your advisor</p>
                    </div>
                `;
                return;
            }

            const displayList = limit ? meetingList.slice(0, limit) : meetingList;

            container.innerHTML = displayList.map(meeting => {
                const meetingDate = new Date(`${meeting.date}T${meeting.time}`);
                const timeStr = meetingDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                const dateStr = meetingDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

                return `
                    <div class="schedule-item" data-meeting-id="${meeting.id}">
                        <div class="schedule-time">
                            <div class="time">${timeStr}</div>
                            <div class="date">${dateStr}</div>
                        </div>
                        <div class="schedule-details">
                            <div class="schedule-title">${meetingTypeLabels[meeting.type] || meeting.type}</div>
                            <div class="schedule-meta">${meeting.duration} min with Dr. Martinez</div>
                        </div>
                        <div class="schedule-actions">
                            <button class="icon-btn danger" data-delete-meeting="${meeting.id}" title="Cancel meeting">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            // Add delete handlers
            container.querySelectorAll('[data-delete-meeting]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = parseInt(btn.dataset.deleteMeeting);
                    if (confirm('Are you sure you want to cancel this meeting?')) {
                        meetings = meetings.filter(m => m.id !== id);
                        saveData(STORAGE_KEYS.MEETINGS, meetings);
                        renderMeetings();
                        updateStats();
                    }
                });
            });
        }

        renderMeetingList(upcomingList, upcomingMeetings, 3);
        renderMeetingList(allList, meetings.sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`)));
    }

    // ============================================
    // Notes Management
    // ============================================
    function openNoteModal(existingNote = null) {
        document.getElementById('noteModalTitle').textContent = existingNote ? 'Edit Note' : 'New Note';
        document.getElementById('noteForm').reset();

        if (existingNote) {
            document.getElementById('noteTitle').value = existingNote.title;
            document.getElementById('noteCategory').value = existingNote.category;
            document.getElementById('noteContent').value = existingNote.content;
            document.getElementById('saveNoteBtn').dataset.editId = existingNote.id;
        } else {
            delete document.getElementById('saveNoteBtn').dataset.editId;
        }

        openModal(noteModal);
    }

    document.getElementById('newNoteBtn')?.addEventListener('click', () => openNoteModal());

    document.getElementById('saveNoteBtn').addEventListener('click', () => {
        const title = document.getElementById('noteTitle').value.trim();
        const category = document.getElementById('noteCategory').value;
        const content = document.getElementById('noteContent').value.trim();
        const editId = document.getElementById('saveNoteBtn').dataset.editId;

        if (!title || !content) {
            alert('Please enter a title and content');
            return;
        }

        if (editId) {
            // Update existing note
            const noteIndex = notes.findIndex(n => n.id === parseInt(editId));
            if (noteIndex !== -1) {
                notes[noteIndex] = {
                    ...notes[noteIndex],
                    title,
                    category,
                    content,
                    updatedAt: new Date().toISOString()
                };
            }
        } else {
            // Create new note
            const note = {
                id: Date.now(),
                title,
                category,
                content,
                createdAt: new Date().toISOString()
            };
            notes.push(note);
        }

        saveData(STORAGE_KEYS.NOTES, notes);
        closeModal(noteModal);
        renderNotes();
        updateStats();
    });

    function renderNotes() {
        const recentList = document.getElementById('recentNotesList');
        const allList = document.getElementById('allNotesList');

        const sortedNotes = [...notes].sort((a, b) =>
            new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
        );

        const categoryLabels = {
            'meeting': 'Meeting Notes',
            'courses': 'Course Planning',
            'requirements': 'Degree Requirements',
            'general': 'General'
        };

        function renderNoteItem(note) {
            const date = new Date(note.updatedAt || note.createdAt);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            return `
                <div class="note-item" data-note-id="${note.id}">
                    <div class="note-header">
                        <h4 class="note-title">${note.title}</h4>
                    </div>
                    <p class="note-preview">${note.content}</p>
                    <div class="note-footer">
                        <span class="note-date">${dateStr}</span>
                        <span class="note-tag">${categoryLabels[note.category] || note.category}</span>
                    </div>
                </div>
            `;
        }

        if (sortedNotes.length === 0) {
            const emptyHtml = `
                <div class="empty-state">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h4>No notes yet</h4>
                    <p>Create your first advisement note</p>
                </div>
            `;
            recentList.innerHTML = emptyHtml;
            allList.innerHTML = emptyHtml;
            return;
        }

        // Recent notes (limit 3)
        recentList.innerHTML = sortedNotes.slice(0, 3).map(renderNoteItem).join('');

        // All notes
        allList.innerHTML = sortedNotes.map(renderNoteItem).join('');

        // Add click handlers
        document.querySelectorAll('.note-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = parseInt(item.dataset.noteId);
                const note = notes.find(n => n.id === id);
                if (note) openNoteModal(note);
            });
        });
    }

    // ============================================
    // Course Schedule Builder
    // ============================================
    function renderCourseList() {
        const courseList = document.getElementById('courseList');
        const searchInput = document.getElementById('courseSearch');

        function render(filter = '') {
            const filteredCourses = availableCourses.filter(course =>
                course.code.toLowerCase().includes(filter.toLowerCase()) ||
                course.name.toLowerCase().includes(filter.toLowerCase())
            );

            courseList.innerHTML = filteredCourses.map(course => {
                const isSelected = selectedCourses.some(c => c.code === course.code);
                return `
                    <div class="course-item ${isSelected ? 'selected' : ''}" data-course-code="${course.code}">
                        <div class="course-checkbox">
                            ${isSelected ? '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" style="width:12px;height:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>' : ''}
                        </div>
                        <div class="course-info">
                            <div class="course-code">${course.code}</div>
                            <div class="course-name">${course.name}</div>
                        </div>
                        <div class="course-credits">${course.credits} cr</div>
                    </div>
                `;
            }).join('');

            // Add click handlers
            courseList.querySelectorAll('.course-item').forEach(item => {
                item.addEventListener('click', () => {
                    const code = item.dataset.courseCode;
                    toggleCourse(code);
                });
            });
        }

        render();

        searchInput.addEventListener('input', (e) => {
            render(e.target.value);
        });
    }

    function toggleCourse(code) {
        const course = availableCourses.find(c => c.code === code);
        if (!course) return;

        const index = selectedCourses.findIndex(c => c.code === code);
        if (index !== -1) {
            selectedCourses.splice(index, 1);
        } else {
            selectedCourses.push(course);
        }

        saveData(STORAGE_KEYS.SELECTED_COURSES, selectedCourses);
        renderCourseList();
        renderWeeklySchedule();
        updateStats();
    }

    function renderWeeklySchedule() {
        const scheduleEl = document.getElementById('weeklySchedule');
        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
        const dayMap = { 'M': 0, 'T': 1, 'W': 2, 'Th': 3, 'F': 4 };
        const timeSlots = ['8:00', '9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];

        // Build header row
        let html = '<div class="schedule-header time-header">Time</div>';
        days.forEach(day => {
            html += `<div class="schedule-header">${day}</div>`;
        });

        // Build time slot rows
        timeSlots.forEach((time, timeIndex) => {
            html += `<div class="time-slot">${time}</div>`;

            days.forEach((day, dayIndex) => {
                html += `<div class="schedule-cell" data-day="${dayIndex}" data-time="${timeIndex}"></div>`;
            });
        });

        scheduleEl.innerHTML = html;

        // Place courses on schedule
        selectedCourses.forEach(course => {
            course.days.forEach(day => {
                const dayIndex = dayMap[day];
                if (dayIndex === undefined) return;

                const startHour = parseInt(course.startTime.split(':')[0]);
                const timeIndex = startHour - 8;

                if (timeIndex < 0 || timeIndex >= timeSlots.length) return;

                const cell = scheduleEl.querySelector(`[data-day="${dayIndex}"][data-time="${timeIndex}"]`);
                if (cell) {
                    const duration = (parseInt(course.endTime.split(':')[0]) - startHour);
                    const height = duration * 60 + (duration > 1 ? 1 : 0);

                    cell.innerHTML = `
                        <div class="class-block" style="height: ${height}px; top: 0;">
                            <div class="class-code">${course.code}</div>
                            <div class="class-room">${course.room}</div>
                        </div>
                    `;
                }
            });
        });

        // Update summary
        const totalCredits = selectedCourses.reduce((sum, c) => sum + c.credits, 0);
        document.getElementById('totalCredits').textContent = totalCredits;
        document.getElementById('totalCourses').textContent = selectedCourses.length;
    }

    document.getElementById('saveScheduleBtn')?.addEventListener('click', () => {
        saveData(STORAGE_KEYS.SELECTED_COURSES, selectedCourses);
        alert('Schedule saved successfully!');
    });

    // ============================================
    // Stats Update
    // ============================================
    function updateStats() {
        const now = new Date();
        const upcomingMeetings = meetings.filter(m => new Date(`${m.date}T${m.time}`) >= now);
        const totalCredits = selectedCourses.reduce((sum, c) => sum + c.credits, 0);

        statMeetingsEl.textContent = upcomingMeetings.length;
        statCreditsEl.textContent = totalCredits;
        statNotesEl.textContent = notes.length;
    }

    // ============================================
    // Logout
    // ============================================
    logoutButton.addEventListener('click', () => {
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('loggedInUser');
        window.location.href = API_LOGIN_URL;
    });

    // ============================================
    // Initialize
    // ============================================
    initializeUserInfo();
    renderMeetings();
    renderNotes();
    renderCourseList();
    renderWeeklySchedule();
    updateStats();
});
