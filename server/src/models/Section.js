const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Section name is required'],
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    floor: {
      type: Number,
      default: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    amenities: [String], // e.g. ['wifi', 'power_outlet', 'quiet_zone']
  },
  { timestamps: true }
);

module.exports = mongoose.model('Section', sectionSchema);
