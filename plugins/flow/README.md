# Flow - Your Focus Companion

```
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   ⚠️  WARNING: PRERELEASE ALPHA - USE AT YOUR OWN RISK  ⚠️        ║
║                                                                   ║
║   This plugin is in early development. Expect bugs, breaking      ║
║   changes, and incomplete features. Your feedback helps!          ║
║                                                                   ║
║   Before installing, update ALL Thymer Sync Hub components:       ║
║   • Sync Hub (synchub/)                                           ║
║   • PlannerHub (plannerhub/)                                      ║
║   • All sync plugins you use (github, readwise, etc.)             ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
```

Flow is a focus session tracker for Thymer that helps you plan your day, track work sessions, and stay in flow.

## Features

- **Status Bar Integration** - See your current task and elapsed time at a glance
- **Compact View** - Floating card with timer, progress ring, and quick controls
- **Full Planning View** - Visual day planner with:
  - Drag-and-drop task scheduling
  - Calendar event integration
  - Task duration estimates (resize by dragging)
  - Side-by-side overlap layout for concurrent events
- **Session Tracking** - Start, pause, resume, and complete focus sessions
- **PlannerHub Integration** - Works with your daily tasks and issues

## Requirements

- **PlannerHub** plugin must be installed and loaded first
- Thymer with Custom CSS support

## Installation

### Step 1: Install CSS

1. Copy the contents of `flow.css`
2. In Thymer, open the command palette
3. Run the **Upload css** command
4. Paste the CSS content and save

### Step 2: Install Plugin

1. Copy the contents of `plugin.js`
2. In Thymer, go to **Settings > Plugins**
3. Click **New Plugin** and select **App Plugin**
4. Paste the plugin code
5. Set the plugin name to "Flow"
6. Save and enable the plugin

### Step 3: Verify Installation

After installation, you should see:
- A Flow indicator in the status bar (bottom of screen)
- Click it to open the compact or full planning view

## Usage

### Status Bar
- **Click** the status bar item to toggle the overlay
- Shows: active task name and elapsed time
- Dot color: green (active), yellow (paused), gray (idle)

### Compact View
- Quick timer with progress ring
- Pause/Resume and Complete buttons
- Shows next task in queue
- Click expand icon for full view

### Full Planning View
- **Left panel**: Task backlog from PlannerHub
- **Right panel**: Visual day timeline
- **Drag tasks** from backlog to timeline to schedule them
- **Resize tasks** by dragging the bottom edge
- **Click estimate badge** to set task duration (15m, 30m, 1h, 2h, 4h)
- **Hour range toggle**: 9-17, 7-21, or 24h view

### Keyboard Shortcuts
(Coming soon)

## API

Flow exposes `window.flow` with these methods:

```javascript
// Session control
flow.startSession(taskGuid?)  // Start session (optional specific task)
flow.pauseSession()           // Pause current session
flow.resumeSession()          // Resume paused session
flow.endSession()             // Complete and end session

// State
flow.getSession()             // Get current session info
flow.isActive()               // true if session running (not paused)
flow.isPaused()               // true if session paused

// UI
flow.setMode('compact'|'full') // Set overlay mode
flow.getMode()                 // Get current mode
flow.show()                    // Show overlay
flow.hide()                    // Hide overlay
flow.toggle()                  // Toggle overlay visibility
```

## Version

v1.4.0

## Changelog

### v1.4.0
- Event logging infrastructure (disabled pending Slot API)
- Improved session management

### v1.3.9
- Side-by-side overlap layout for concurrent events
- Throttled mousemove for smoother drag/resize

### v1.3.8
- Fixed duplicate events and post-interaction click issues

### v1.3.6
- Mouse-based drag-drop for task scheduling
- Backlog UX improvements

### v1.3.4
- Duration label shown above handle while resizing

### v1.3.3
- Task resize by dragging bottom edge
