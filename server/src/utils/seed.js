require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Section = require('../models/Section');
const Seat = require('../models/Seat');
const Booking = require('../models/Booking');
const Settings = require('../models/Settings');

/**
 * Two modes:
 *   npm run seed        DEMO mode: DELETES everything (users, bookings, seats...) and creates demo data.
 *   npm run seed:safe   SAFE mode: never deletes. Creates the settings, the first admin and the starter
 *                       sections/seats only if they do not exist yet. Use this on a live / Atlas database.
 *                       Admin login can be chosen with ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME env variables.
 */
const SAFE = process.argv.includes('--safe');

const createSectionsAndSeats = async () => {
  const sections = await Section.insertMany([
    { name: 'General Reading', description: 'Open reading area', floor: 1, amenities: ['wifi'] },
    { name: 'Silent Zone', description: 'Strictly no talking', floor: 2, amenities: ['wifi', 'power_outlet'] },
    { name: 'Group Study', description: 'Discussion allowed', floor: 1, amenities: ['wifi', 'whiteboard'] },
    { name: 'Computer Lab', description: 'Computer workstations', floor: 3, amenities: ['wifi', 'power_outlet', 'computer'] },
  ]);
  console.log('Sections created:', sections.map((s) => s.name).join(', '));

  const seats = [];
  sections.forEach((section, si) => {
    for (let i = 1; i <= 10; i++) {
      seats.push({
        seatNumber: `${String.fromCharCode(65 + si)}${String(i).padStart(2, '0')}`,
        section: section._id,
        row: Math.ceil(i / 5),
        col: ((i - 1) % 5) + 1,
      });
    }
  });
  // Group discussion rooms (book the whole room for a group)
  const roomSection = await Section.create({ name: 'Discussion Rooms', description: 'Bookable rooms for group study', floor: 2, amenities: ['wifi', 'whiteboard', 'power_outlet'] });
  for (let i = 1; i <= 3; i++) {
    seats.push({ seatNumber: `ROOM-${i}`, section: roomSection._id, row: 1, col: i, kind: 'room', capacity: i === 3 ? 10 : 6 });
  }
  await Seat.insertMany(seats);
  console.log(`Seats created: ${seats.length} (including 3 group rooms)`);
};

const seed = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing. Set it in server/.env first.');
  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected to MongoDB (${mongoose.connection.host}) - mode: ${SAFE ? 'SAFE (nothing is deleted)' : 'DEMO (deletes everything first)'}`);

  if (!SAFE) {
    await Promise.all([User.deleteMany(), Section.deleteMany(), Seat.deleteMany(), Booking.deleteMany(), Settings.deleteMany()]);
    await Settings.create({ key: 'global' });

    const admin = await User.create({ name: 'Library Admin', email: 'admin@library.edu', password: 'Admin@1234', role: 'admin', emailVerified: true });
    console.log('Admin created:', admin.email);
    const student = await User.create({ name: 'Test Student', email: 'student@library.edu', password: 'Student@1234', role: 'student', studentId: 'STU001', emailVerified: true });
    console.log('Student created:', student.email);
    await createSectionsAndSeats();

    console.log('\n--- Seed complete ---');
    console.log('Admin: admin@library.edu / Admin@1234');
    console.log('Student: student@library.edu / Student@1234');
    return;
  }

  // ---- SAFE mode ----
  if (!(await Settings.exists({ key: 'global' }))) {
    await Settings.create({ key: 'global' });
    console.log('Settings created');
  } else console.log('Settings already exist - skipped');

  if (!(await User.exists({ role: 'admin' }))) {
    const email = (process.env.ADMIN_EMAIL || 'admin@library.edu').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'Admin@1234';
    await User.create({ name: process.env.ADMIN_NAME || 'Library Admin', email, password, role: 'admin', emailVerified: true });
    console.log(`Admin created: ${email}${process.env.ADMIN_PASSWORD ? '' : ' / Admin@1234  (CHANGE THIS PASSWORD after you log in!)'}`);
  } else console.log('An admin already exists - skipped');

  if ((await Section.countDocuments()) === 0) await createSectionsAndSeats();
  else console.log('Sections already exist - skipped');

  console.log('\n--- Safe seed complete (nothing was deleted) ---');
};

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });