const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    adminName: { type: String },
    action: { type: String, required: true, index: true },
    targetType: { type: String },
    targetId: { type: String },
    details: { type: String, default: '' },
    ip: { type: String },
  },
  { timestamps: true }
);
auditSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditSchema);
