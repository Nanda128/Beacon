# BEACON - Behavioral Engine for Autonomous Coordination in Ocean Navigation

Nandakishore Vinayakrishnan's Final Year Project's code implementation for BSc/MSc Immersive Software Engineering for the University of Limerick.

## Overview

BEACON is a behavioral engine designed to facilitate autonomous coordination in ocean navigation. This project aims to develop a robust system that enables autonomous vessels to navigate and coordinate effectively in marine environments while ensuring that human operators can oversee and intervene when necessary.

# Beacon Mission Planner

This app displays an OpenStreetMap-based map and lets you define a mission area by drawing a fixed-aspect rectangle. The mission area is converted into a geographic grid for mission planning.

## Development

```powershell
npm install
npm run dev
```

Then open the printed local URL in your browser.

## Usage

- Pan and zoom the map to your area of interest.
- Click and drag on the map to draw a mission rectangle.
- The rectangle is constrained to a fixed length:width ratio based on the grid configuration so it can be evenly divided into a grid.
- After you release the mouse, the mission area is locked and summarized in the sidebar.
- Use **Reset mission area** in the sidebar to clear the current mission and draw a new one.
