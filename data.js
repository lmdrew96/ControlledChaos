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
        { startTime: '15:00', endTime: '16:00', text: 'Therapy (at school)', type: 'personal', location: 'school', editable: false },
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

// Schedule overrides (date-specific changes) - YYYY-MM-DD format
let scheduleOverrides = {};

// Export for use in other files (if using modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { defaultSchedule, scheduleOverrides };
}
