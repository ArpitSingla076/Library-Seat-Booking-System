const mongoose = require('mongoose');
const crypto = require('crypto');

const seatSchema = new mongoose.Schema(
  {
    seatNumber: {
      type: String,
      required: [true, 'Seat number is required'],
      trim: true,
    },
    section: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      required: [true, 'Section is required'],
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    isMaintenance: {
      type: Boolean,
      default: false,
    },
    maintenanceNote: {
      type: String,
      default: null,
    },
    amenities: [String], // power outlet, window seat, etc.
    currentBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    // Secret printed as a QR code on the physical seat; used for QR check-in
    qrToken: { type: String, default: () => crypto.randomBytes(12).toString('hex'), unique: true, sparse: true },
    kind: { type: String, enum: ['seat', 'room'], default: 'seat' },
    capacity: { type: Number, default: 1, min: 1, max: 100 }, // group rooms hold several people
    row: { type: Number },
    col: { type: Number },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound unique index: seatNumber within a section
seatSchema.index({ section: 1, seatNumber: 1 }, { unique: true });
seatSchema.index({ isAvailable: 1, isMaintenance: 1 });

module.exports = mongoose.model('Seat', seatSchema);
