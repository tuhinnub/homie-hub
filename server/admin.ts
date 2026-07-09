/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { db } from './db.js';
import { authenticateToken } from './auth.js';

export const adminRouter = express.Router();

// Middleware to secure admin-only routes
export function authenticateAdmin(req: any, res: any, next: any) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Administrative access required.' });
  }
  next();
}

// Attach token check to all routes in this router
adminRouter.use(authenticateToken);
adminRouter.use(authenticateAdmin);

// Helper: Add a system log entry
export function addSystemLog(action: string, details: string, operator: string = 'System') {
  try {
    db.logs.create({
      action,
      details,
      operator,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to add system log:', err);
  }
}

// 1. ANALYTICS & DIAGNOSTICS
adminRouter.get('/analytics', (req: any, res) => {
  try {
    const totalUsers = db.users.find().length;
    const onlineUsers = db.users.find(u => u.onlineStatus === 'online').length;
    const idleUsers = db.users.find(u => u.onlineStatus === 'idle').length;
    
    const totalMessages = db.messages.find().length;
    const totalChats = db.chats.find().length;
    const totalStories = db.stories.find().length;
    const totalCalls = db.calls.find().length;
    const totalTodos = db.todos.find().length;
    const totalPolls = db.polls.find().length;
    const totalReports = db.reports.find().length;

    // Calculate database file size or approximate storage
    const storageUsedMB = (totalUsers * 0.15 + totalMessages * 0.05 + totalStories * 0.45).toFixed(2);
    
    // System CPU/RAM mocks reflecting realistic server performance
    const serverMetrics = {
      cpuUsagePercent: Math.floor(Math.random() * 15) + 5, // 5% - 20%
      memoryUsedGB: (1.2 + Math.random() * 0.4).toFixed(2), // ~1.4 GB
      memoryTotalGB: 4.0,
      apiLatencyMs: Math.floor(Math.random() * 12) + 6, // 6ms - 18ms
      uptimeSeconds: Math.floor(process.uptime()),
      dbConnected: true,
      environment: process.env.NODE_ENV || 'development'
    };

    // User engagement trends (mock data representing startup growth)
    const activeUserTrend = [
      { date: 'Mon', active: Math.floor(totalUsers * 0.4) || 2 },
      { date: 'Tue', active: Math.floor(totalUsers * 0.5) || 3 },
      { date: 'Wed', active: Math.floor(totalUsers * 0.45) || 3 },
      { date: 'Thu', active: Math.floor(totalUsers * 0.6) || 4 },
      { date: 'Fri', active: Math.floor(totalUsers * 0.7) || 5 },
      { date: 'Sat', active: Math.floor(totalUsers * 0.8) || 6 },
      { date: 'Sun', active: Math.floor(totalUsers * 0.75) || 6 },
    ];

    res.json({
      counters: {
        totalUsers,
        onlineUsers,
        idleUsers,
        totalMessages,
        totalChats,
        totalStories,
        totalCalls,
        totalTodos,
        totalPolls,
        totalReports,
        storageUsedMB: parseFloat(storageUsedMB)
      },
      metrics: serverMetrics,
      engagementTrend: activeUserTrend
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to compile admin analytics.' });
  }
});

// 2. USER MANAGEMENT
adminRouter.get('/users', (req: any, res) => {
  try {
    const allUsers = db.users.find();
    // Strip sensitive password hashes before returning
    const sanitized = allUsers.map(({ passwordHash: _, ...user }) => user);
    res.json({ users: sanitized });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list users.' });
  }
});

// Toggle Verification
adminRouter.put('/users/:userId/verify', (req: any, res) => {
  try {
    const { userId } = req.params;
    const target = db.users.findById(userId);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const updated = db.users.findByIdAndUpdate(userId, {
      isVerified: !target.isVerified
    });

    addSystemLog(
      'user_verify_toggle',
      `Toggled verification state of @${target.username} to ${!target.isVerified}`,
      req.user.username
    );

    res.json({ user: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle Ban
adminRouter.put('/users/:userId/ban', (req: any, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Admin cannot ban themselves.' });
    }

    const target = db.users.findById(userId);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const newBanState = !target.isBanned;
    const updated = db.users.findByIdAndUpdate(userId, {
      isBanned: newBanState,
      onlineStatus: newBanState ? 'offline' : target.onlineStatus
    });

    addSystemLog(
      'user_ban_toggle',
      `Toggled ban state of @${target.username} to ${newBanState}`,
      req.user.username
    );

    res.json({ user: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle Suspension
adminRouter.put('/users/:userId/suspend', (req: any, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Admin cannot suspend themselves.' });
    }

    const target = db.users.findById(userId);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const newSuspendState = !target.isSuspended;
    const updated = db.users.findByIdAndUpdate(userId, {
      isSuspended: newSuspendState,
      onlineStatus: newSuspendState ? 'offline' : target.onlineStatus
    });

    addSystemLog(
      'user_suspend_toggle',
      `Toggled suspension state of @${target.username} to ${newSuspendState}`,
      req.user.username
    );

    res.json({ user: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Change Role
adminRouter.put('/users/:userId/role', (req: any, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role assignment.' });
    }

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Admin cannot revoke their own privilege.' });
    }

    const target = db.users.findById(userId);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    const updated = db.users.findByIdAndUpdate(userId, { role });

    addSystemLog(
      'user_role_change',
      `Changed role of @${target.username} to ${role}`,
      req.user.username
    );

    res.json({ user: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete User Account
adminRouter.delete('/users/:userId', (req: any, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete active session admin.' });
    }

    const target = db.users.findById(userId);
    if (!target) return res.status(404).json({ error: 'User not found.' });

    db.users.deleteOne(userId);

    addSystemLog(
      'user_delete',
      `Deleted user account @${target.username} permanently`,
      req.user.username
    );

    res.json({ success: true, message: 'User account removed.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// 3. MODERATION & REPORTS
adminRouter.get('/reports', (req: any, res) => {
  try {
    const reports = db.reports.find();
    res.json({ reports });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Submit a new moderation report
adminRouter.post('/reports', (req: any, res) => {
  try {
    const { contentId, contentType, reason, reportedContent } = req.body;
    if (!contentId || !contentType || !reason) {
      return res.status(400).json({ error: 'ContentID, type, and reason are required.' });
    }

    const newReport = db.reports.create({
      contentId,
      contentType, // 'message' | 'story'
      reason,
      reportedContent,
      reporterUsername: req.user.username,
      status: 'pending', // 'pending' | 'resolved'
    });

    addSystemLog(
      'report_created',
      `New report submitted on ${contentType} "${contentId}" for: ${reason}`,
      req.user.username
    );

    res.status(201).json({ report: newReport });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Action a report (Delete content or dismiss)
adminRouter.post('/reports/:reportId/action', (req: any, res) => {
  try {
    const { reportId } = req.params;
    const { action } = req.body; // 'delete' | 'dismiss'
    
    const report = db.reports.findById(reportId);
    if (!report) return res.status(404).json({ error: 'Report not found.' });

    if (action === 'delete') {
      if (report.contentType === 'message') {
        db.messages.deleteOne(report.contentId);
      } else if (report.contentType === 'story') {
        db.stories.deleteOne(report.contentId);
      }
      db.reports.findByIdAndUpdate(reportId, { status: 'resolved', resolution: 'deleted' });
      addSystemLog('report_resolved', `Deleted flagged content for report ${reportId}`, req.user.username);
    } else {
      db.reports.findByIdAndUpdate(reportId, { status: 'resolved', resolution: 'dismissed' });
      addSystemLog('report_dismissed', `Dismissed report ${reportId}`, req.user.username);
    }

    res.json({ success: true, message: `Report handled with action: ${action}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// 4. SYSTEM FEATURE FLAGS
adminRouter.get('/feature-flags', (req: any, res) => {
  try {
    // Populate defaults if none exist
    let flags = db.featureFlags.find();
    if (flags.length === 0) {
      const defaults = [
        { key: 'enable_ai_lounge', label: 'Enable HomieAI Assistant & Summary', value: true },
        { key: 'enable_stories_feed', label: 'Enable 24h stories', value: true },
        { key: 'enable_webrtc_calling', label: 'Enable HD Voice/Video Calls', value: true },
        { key: 'maintenance_mode', label: 'Platform Maintenance Mode (Block logins)', value: false }
      ];
      defaults.forEach(flag => db.featureFlags.create(flag));
      flags = db.featureFlags.find();
    }
    res.json({ flags });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle a dynamic feature flag
adminRouter.put('/feature-flags/:key', (req: any, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const flag = db.featureFlags.findOne(f => f.key === key);
    if (!flag) return res.status(404).json({ error: 'Feature flag not found.' });

    const updated = db.featureFlags.findByIdAndUpdate(flag.id, { value: !!value });

    addSystemLog(
      'feature_flag_toggle',
      `Toggled feature flag "${key}" to ${!!value}`,
      req.user.username
    );

    res.json({ flag: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// 5. AUDIT LOGS LIST
adminRouter.get('/logs', (req: any, res) => {
  try {
    const logs = db.logs.find();
    // Return latest logs first
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json({ logs: logs.slice(0, 80) }); // limit to recent 80 logs
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
