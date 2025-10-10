// data.js - Default schedule data and constants

// Default recurring schedule template
const defaultSchedule = {
    'Monday': [
        { startTime: '07:15', endTime: '07:25', text: 'Wake up & take meds', type: 'personal', location: 'home', editable: false, protected: false },
        { startTime: '07:25', endTime: '08:00', text: 'Get ready for school', type: 'personal', location: 'home', editable: false, protected: false },
        { startTime: '08:00', endTime: '08:40', text: 'Commute to school', type: 'free', location: 'commute', editable: false },
        { startTime: '08:40', endTime: '10:30', text: 'FREE TIME at school', type: 'free', location: 'school', editable: true },
        { startTime: '10:35', endTime: '11:55', text: 'US Politics class', type: 'class', location: 'school', editable: false },
        { startTime: '12:00', endTime: '13:00', text: 'Peer Mentor (optional)', type: 'personal', location: 'school', editable: true },
        { startTime: '13:00', endTime: '13:40', text: 'Commute home', type: 'free', location: 'commute', editable: false },
        { startTime: '13:40', endTime: '21:00', text: 'Evening free time', type: 'free', location: 'home', editable: true }
    ],
    'Tuesday': [
        { startTime: '07:15', endTime: '07:25', text: 'Wake up & take meds', type: 'personal', location: 'home', editable: false, protected: false },
        { startTime: '07:25', endTime: '08:00', text: 'Get ready for school', type: 'personal', location: 'home', editable: false, protected: false },
        { startTime: '08:00', endTime: '08:40', text: 'Commute to school', type: 'free', location: 'commute', editable: false },
        { startTime: '08:40', endTime: '08:55', text: 'Last-Minute Study for World History', type: 'free', location: 'school', editable: false },
        { startTime: '09:00', endTime: '10:20', text: 'World History class', type: 'class', location: 'school', editable: false },
        { startTime: '10:20', endTime: '11:00', text: 'FREE TIME at school', type: 'free', location: 'school', editable: true },
        { startTime: '11:00', endTime: '11:55', text: 'Peer Mentor (mandatory)', type: 'personal', location: 'school', editable: false },
        { startTime: '12:00', endTime: '13:00', text: 'Hen & Ink Society', type: 'personal', location: 'school', editable: true },
        { startTime: '13:00', endTime: '14:55', text: 'FREE at school', type: 'free', location: 'school', editable: true },
        { startTime: '15:00', endTime: '16:00', text: 'Therapy (at school)', type: 'personal', location: 'school', editable: false, protected: true },
        { startTime: '16:00', endTime: '16:40', text: 'Commute home', type: 'free', location: 'commute', editable: false },
        { startTime: '16:55', endTime: '21:00', text: 'BIO WORK (all due Wed!)', type: 'free', location: 'home', editable: true }
    ],
    'Wednesday': [
        { startTime: '07:15', endTime: '07:25', text: 'Wake up & take meds', type: 'personal', location: 'home', editable: false, protected: false },
        { startTime: '07:25', endTime: '08:00', text: 'Get ready for school', type: 'personal', location: 'home', editable: false, protected: false },
        { startTime: '08:00', endTime: '08:40', text: 'Commute to school', type: 'free', location: 'commute', editable: false },
        { startTime: '08:40', endTime: '10:30', text: 'FREE at school (Beatles discussion)', type: 'free', location: 'school', editable: true },
        { startTime: '10:35', endTime: '11:55', text: 'US Politics class', type: 'class', location: 'school', editable: false },
        { startTime: '12:00', endTime: '13:00', text: 'Peer Mentor (optional)', type: 'personal', location: 'school', editable: true },
        { startTime: '13:00', endTime: '13:55', text: 'Peer Mentor (mandatory)', type: 'personal', location: 'school', editable: false },
        { startTime: '14:00', endTime: '14:35', text: 'Commute home', type: 'free', location: 'commute', editable: false },
        { startTime: '14:35', endTime: '21:00', text: 'Evening free time', type: 'free', location: 'home', editable: true }
    ],
    'Thursday': [
        { startTime: '07:15', endTime: '07:25', text: 'Wake up & take meds', type: 'personal', location: 'home', editable: false, protected: false },
        { startTime: '07:25', endTime: '08:00', text: 'Get ready for school', type: 'personal', location: 'home', editable: false, protected: false },
        { startTime: '08:00', endTime: '08:40', text: 'Commute to school', type: 'free', location: 'commute', editable: false },
        { startTime: '08:40', endTime: '08:55', text: 'Last-Minute Study for World History', type: 'free', location: 'school', editable: false },
        { startTime: '09:00', endTime: '10:20', text: 'World History class', type: 'class', location: 'school', editable: false },
        { startTime: '10:20', endTime: '12:00', text: 'FREE at school', type: 'free', location: 'school', editable: true },
        { startTime: '12:00', endTime: '13:00', text: 'Hen & Ink Society', type: 'personal', location: 'school', editable: true },
        { startTime: '13:00', endTime: '16:40', text: 'FREE at school', type: 'free', location: 'school', editable: true },
        { startTime: '16:45', endTime: '19:00', text: 'Bio class', type: 'class', location: 'school', editable: false },
        { startTime: '19:00', endTime: '19:40', text: 'Commute home', type: 'free', location: 'commute', editable: false },
        { startTime: '20:00', endTime: '21:00', text: 'D&D PREP SESSION 1', type: 'protected', location: 'home', editable: false, protected: true },
        { startTime: '21:00', endTime: '22:00', text: 'Free time / wind down', type: 'free', location: 'home', editable: true }
    ],
    'Friday': [
        { startTime: '07:15', endTime: '07:25', text: 'Wake up & take meds', type: 'personal', location: 'home', editable: false, protected: false },
        { startTime: '07:25', endTime: '08:00', text: 'Get ready for the day', type: 'personal', location: 'home', editable: false, protected: false },
        { startTime: '08:00', endTime: '09:00', text: 'Read a Book!', type: 'protected', location: 'home', editable: false, protected: true },
        { startTime: '09:00', endTime: '12:00', text: 'Flex time - finish weekend work', type: 'free', location: 'home', editable: true },
        { startTime: '12:00', endTime: '14:00', text: 'D&D PREP SESSION 2', type: 'protected', location: 'home', editable: false, protected: true },
        { startTime: '14:00', endTime: '14:35', text: 'Get ready for work', type: 'personal', location: 'home', editable: false, protected: false },
        { startTime: '14:35', endTime: '15:00', text: 'Commute to work', type: 'free', location: 'commute', editable: false },
        { startTime: '15:00', endTime: '22:00', text: 'WORK', type: 'work', location: 'work', editable: false },
        { startTime: '22:25', endTime: '22:50', text: 'Commute home', type: 'free', location: 'commute', editable: false }
    ],
    'Saturday': [
        { startTime: '07:45', endTime: '08:00', text: 'Wake up & take meds', type: 'personal', location: 'home', editable: false, protected: false },
        { startTime: '08:00', endTime: '09:00', text: 'Get ready for work', type: 'personal', location: 'home', editable: false, protected: false },
        { startTime: '09:00', endTime: '10:30', text: 'D&D PREP SESSION 3', type: 'protected', location: 'home', editable: false, protected: true },
        { startTime: '10:30', endTime: '11:00', text: 'Commute to work', type: 'free', location: 'commute', editable: false },
        { startTime: '11:00', endTime: '22:00', text: 'WORK (long shift!)', type: 'work', location: 'work', editable: false },
        { startTime: '22:25', endTime: '22:50', text: 'Commute home', type: 'free', location: 'commute', editable: false }
    ],
    'Sunday': [
        { startTime: '08:45', endTime: '09:00', text: 'Wake up & take meds', type: 'personal', location: 'home', editable: false, protected: false },
        { startTime: '09:00', endTime: '10:30', text: 'Get ready & relax', type: 'personal', location: 'home', editable: true, protected: false },
        { startTime: '10:30', endTime: '12:00', text: 'Submit deadlines & review', type: 'free', location: 'home', editable: true },
        { startTime: '12:00', endTime: '16:00', text: 'MAYBE WORK (50/50 chance)', type: 'work', location: 'work', editable: true },
        { startTime: '16:30', endTime: '20:30', text: 'D&D GAME TIME! 🎲', type: 'protected', location: 'home', editable: false, protected: true }
    ]
};

// Default deadlines (will be loaded into appData on first run)
const defaultDeadlines = [
    // BIO (BISC104) Deadlines
    { name: "Bio EXAM 1", date: "2025-09-18", category: "exam", class: "Bio" },
    { name: "Bio EXAM 2", date: "2025-10-16", category: "exam", class: "Bio" },
    { name: "Bio EXAM 3", date: "2025-11-06", category: "exam", class: "Bio" },
    { name: "Bio EXAM 4 (Final)", date: "2025-12-04", category: "exam", class: "Bio" },
    
    // Bio Weekly Assignments - Next few weeks
    { name: "Bio SmartBooks Ch 2-4", date: "2025-09-28", category: "assignment", class: "Bio" },
    { name: "Bio Assignments Ch 2-4", date: "2025-09-28", category: "assignment", class: "Bio" },
    { name: "Bio Quiz Ch 2-3", date: "2025-09-28", category: "quiz", class: "Bio" },
    { name: "Bio Labs 0-2", date: "2025-09-28", category: "lab", class: "Bio" },
    
    { name: "Bio SmartBooks Ch 5-7", date: "2025-10-16", category: "assignment", class: "Bio" },
    { name: "Bio Assignments Ch 5-7", date: "2025-10-16", category: "assignment", class: "Bio" },
    { name: "Bio Lab 3: Osmosis", date: "2025-10-02", category: "lab", class: "Bio" },
    { name: "Bio Lab 4: Cellular Respiration", date: "2025-10-09", category: "lab", class: "Bio" },
    { name: "Bio Lab 5: Photosynthesis", date: "2025-10-16", category: "lab", class: "Bio" },
    { name: "Bio Quiz Ch 7", date: "2025-10-09", category: "quiz", class: "Bio" },
    
    { name: "Bio SmartBooks Ch 8-10", date: "2025-11-06", category: "assignment", class: "Bio" },
    { name: "Bio Assignments Ch 8-10", date: "2025-11-06", category: "assignment", class: "Bio" },
    { name: "Bio Lab 6: Mitosis", date: "2025-10-23", category: "lab", class: "Bio" },
    { name: "Bio Lab 7: Meiosis", date: "2025-10-30", category: "lab", class: "Bio" },
    { name: "Bio Lab 8: Inheritance", date: "2025-11-06", category: "lab", class: "Bio" },
    { name: "Bio Quiz Ch 8-9", date: "2025-10-30", category: "quiz", class: "Bio" },
    
    { name: "Bio SmartBooks Ch 11,14-15", date: "2025-12-05", category: "assignment", class: "Bio" },
    { name: "Bio Assignments Ch 11,14-15", date: "2025-12-04", category: "assignment", class: "Bio" },
    { name: "Bio Lab 9: Transcription", date: "2025-11-13", category: "lab", class: "Bio" },
    { name: "Bio Lab 10A: Macroevolution", date: "2025-11-20", category: "lab", class: "Bio" },
    { name: "Bio Lab 10B: Microevolution", date: "2025-11-20", category: "lab", class: "Bio" },
    { name: "Bio Lab 11: Molecular Evolution", date: "2025-12-04", category: "lab", class: "Bio" },
    { name: "Bio Quiz Ch 11 & 14", date: "2025-11-20", category: "quiz", class: "Bio" },
    
    // BEATLES (MUSC199) Deadlines
    { name: "Beatles Unit 2 Quiz", date: "2025-09-28", category: "quiz", class: "Beatles" },
    { name: "Beatles Unit 3 Quiz", date: "2025-10-12", category: "quiz", class: "Beatles" },
    
    // US POLITICS (POSC150) Deadlines
    { name: "US Politics Quiz #1", date: "2025-10-01", category: "quiz", class: "Politics" },
    { name: "US Politics Quiz #2", date: "2025-10-19", category: "quiz", class: "Politics" },
    { name: "US Politics Quiz #3", date: "2025-10-19", category: "quiz", class: "Politics" },
    { name: "US Politics Quiz #4", date: "2025-10-19", category: "quiz", class: "Politics" },
    
    // WORLD HISTORY (HIST104) Deadlines
    { name: "World History APS #1 Essay", date: "2025-09-16", category: "assignment", class: "History" },
    { name: "World History APS #2 Essay", date: "2025-09-30", category: "assignment", class: "History" },
    { name: "World History EXAM #1", date: "2025-10-02", category: "exam", class: "History" },
    { name: "World History APS #3 Essay", date: "2025-10-28", category: "assignment", class: "History" },
    { name: "World History EXAM #2", date: "2025-10-30", category: "exam", class: "History" },
    { name: "World History APS #4 Essay", date: "2025-12-02", category: "assignment", class: "History" },
    { name: "World History FINAL EXAM", date: "2025-12-11", category: "exam", class: "History" }
];

// Default projects with task checklists
const defaultProjects = [
    {
        id: 1,
        name: "Tumblr Blog Setup",
        description: "Content ready, needs posting",
        status: "planning",
        progress: 30,
        category: "Personal",
        tasks: [
            { text: "Organize content into categories", completed: true },
            { text: "Set up blog theme and design", completed: true },
            { text: "Write introduction post", completed: false },
            { text: "Schedule first 5 posts", completed: false },
            { text: "Set up posting schedule", completed: false }
        ]
    },
    {
        id: 2,
        name: "FeySpace Player App",
        description: "Works, needs upgrades",
        status: "paused",
        progress: 60,
        category: "D&D/Coding",
        tasks: [
            { text: "Basic character sheet functionality", completed: true },
            { text: "Spell tracking system", completed: true },
            { text: "Inventory management", completed: true },
            { text: "Add dice roller integration", completed: false },
            { text: "Improve mobile responsiveness", completed: false }
        ]
    },
    {
        id: 3,
        name: "N.I.P.P.L.E. DM App",
        description: "Needs major features",
        status: "paused",
        progress: 40,
        category: "D&D/Coding",
        tasks: [
            { text: "Basic encounter tracking", completed: true },
            { text: "NPC database structure", completed: true },
            { text: "Add initiative tracker", completed: false },
            { text: "Build loot generator", completed: false },
            { text: "Create session notes feature", completed: false }
        ]
    },
    {
        id: 4,
        name: "ScribeCat App",
        description: "Defer until winter break",
        status: "planning",
        progress: 0,
        category: "Coding",
        tasks: [
            { text: "Define core features", completed: false },
            { text: "Create wireframes", completed: false },
            { text: "Set up development environment", completed: false },
            { text: "Build basic UI", completed: false },
            { text: "Implement main functionality", completed: false }
        ]
    },
    {
        id: 5,
        name: "Romanian Blog",
        description: "Start in November",
        status: "planning",
        progress: 0,
        category: "Personal",
        tasks: [
            { text: "Choose blogging platform", completed: false },
            { text: "Plan content topics", completed: false },
            { text: "Write first 3 draft posts", completed: false },
            { text: "Set up blog design", completed: false },
            { text: "Publish first post", completed: false }
        ]
    }
];

// Default templates for recurring tasks
const defaultTemplates = [
    {
        name: "Bio Weekly Work",
        description: "SmartBook, Assignment, Quiz, Lab",
        tasks: [
            "Complete SmartBook reading",
            "Complete chapter assignment",
            "Take chapter quiz",
            "Complete lab report"
        ],
        category: "Bio",
        recurringDay: "Tuesday"
    },
    {
        name: "Beatles Discussion & Work",
        description: "Weekly discussion post and presentation work",
        tasks: [
            "Post discussion response",
            "Work on group presentation",
            "Review weekly material"
        ],
        category: "Beatles",
        recurringDay: "Wednesday"
    },
    {
        name: "World History Reading & Quiz",
        description: "Daily reading and quiz prep",
        tasks: [
            "Complete assigned chapter reading",
            "Review quiz questions",
            "Take daily quiz in class"
        ],
        category: "History",
        recurringDay: "Tuesday/Thursday"
    },
    {
        name: "US Politics Weekly",
        description: "Readings and quiz prep",
        tasks: [
            "Complete readings",
            "Review lecture notes",
            "Prepare for quizzes"
        ],
        category: "Politics",
        recurringDay: "Monday"
    },
    {
        name: "Coding Project Session",
        description: "Work on active coding projects",
        tasks: [
            "Check GitHub issues",
            "Work on current feature",
            "Test and debug",
            "Update documentation"
        ],
        category: "Coding",
        recurringDay: "varies"
    },
    {
        name: "D&D Session",
        description: "Weekly D&D game - SACRED TIME",
        tasks: [
            "Prepare session notes",
            "Run the game",
            "Update campaign log"
        ],
        category: "Personal",
        recurringDay: "Sunday",
        protected: true
    }
];

// Schedule overrides (date-specific changes) - YYYY-MM-DD format
let scheduleOverrides = {};

// Export for use in other files (if using modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { defaultSchedule, scheduleOverrides, defaultDeadlines, defaultProjects, defaultTemplates };
}
