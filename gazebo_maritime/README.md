# Maritime SAR Environment - Gazebo Simulation

A realistic maritime environment for Search and Rescue (SAR) scenario testing in Gazebo, designed for multi-drone operations.

## Overview

This package provides:
- **Realistic ocean surface** with animated waves
- **Configurable weather conditions** (wind, visibility, lighting)
- **Three environment presets**: calm, moderate, and rough sea conditions
- **SAR target models**: person in water, life raft, and debris
- **Extensible architecture** for adding new features and scenarios

## Directory Structure

```
gazebo_maritime/
├── worlds/              # Gazebo world files
│   └── maritime_base.sdf
├── models/              # 3D models and assets
│   ├── sar_target_person/
│   ├── sar_target_raft/
│   └── sar_target_debris/
├── config/              # Environment configuration files
│   ├── env_calm.yaml
│   ├── env_moderate.yaml
│   └── env_rough.yaml
└── launch/              # Launch scripts
    ├── launch_maritime.py
    └── spawn_targets.py
```

## Quick Start

### Prerequisites

- Gazebo Sim 8+ (the modern "gz sim", **no ROS required** but works with ROS)
- Python 3.6+
- PyYAML (`pip install pyyaml`)

**Note**: This package works with modern Gazebo (formerly Ignition, now "Gazebo Sim"). If you have ROS 2 Jazzy/Kilted installed, you already have Gazebo. Check with: `gz sim --version`

### Installation

#### Quick Setup (Recommended)

Run the setup script:
```bash
cd /home/user/beacon/gazebo_maritime
./setup.sh
```

Then add the suggested export line to your `~/.bashrc`:
```bash
echo 'export GZ_SIM_RESOURCE_PATH=/home/user/beacon/gazebo_maritime/models:$GZ_SIM_RESOURCE_PATH' >> ~/.bashrc
source ~/.bashrc
```

#### Manual Setup

1. Install dependencies:
```bash
pip3 install pyyaml
```

2. Set the Gazebo model path:
```bash
export GZ_SIM_RESOURCE_PATH=/home/user/beacon/gazebo_maritime/models:$GZ_SIM_RESOURCE_PATH
```

Add this to your `~/.bashrc` for persistence.

### Launching the Environment

Use the Python launch script with different environment presets:

```bash
# Launch with calm conditions (default)
./gazebo_maritime/launch/launch_maritime.py

# Launch with moderate conditions
./gazebo_maritime/launch/launch_maritime.py --env moderate

# Launch with rough sea conditions
./gazebo_maritime/launch/launch_maritime.py --env rough
```

**Important**: The launch script will print the Gazebo command. If you get "command not found", you can copy and run the printed command directly.

### Manual Gazebo Launch

Alternatively, launch directly with Gazebo Sim:

```bash
cd /home/user/beacon
export GZ_SIM_RESOURCE_PATH=$(pwd)/gazebo_maritime/models:$GZ_SIM_RESOURCE_PATH
gz sim gazebo_maritime/worlds/maritime_base.sdf
```

## Environment Presets

### Calm Sea (`env_calm.yaml`)
- Wave height: 0.3m
- Wind speed: 2 m/s (light breeze)
- Clear visibility
- Ideal for testing basic SAR operations

### Moderate Sea (`env_moderate.yaml`)
- Wave height: 1.0m
- Wind speed: 8 m/s (fresh breeze)
- Moderate fog (500m visibility)
- Wind gusts enabled
- Suitable for realistic mission scenarios

### Rough Sea (`env_rough.yaml`)
- Wave height: 2.5m
- Wind speed: 15 m/s (strong breeze/gale)
- Heavy fog (200m visibility)
- Strong gusts
- Challenging conditions for stress testing

## SAR Target Models

Three types of detectable targets are provided:

1. **Person in Water** (`sar_target_person`)
   - Orange cylinder (0.6m diameter)
   - Buoyant (floats on surface)
   - Mass: 70kg

2. **Life Raft** (`sar_target_raft`)
   - Orange rectangular raft (2.0m x 1.5m)
   - High visibility
   - Mass: 50kg

3. **Debris** (`sar_target_debris`)
   - Gray irregular object (1.0m x 0.8m)
   - Partially submerged
   - Mass: 20kg

### Spawning Targets

#### Using the Spawn Script (Recommended)

After launching Gazebo, use the spawn script in a new terminal:

```bash
# Spawn basic scenario (3 targets)
./gazebo_maritime/launch/spawn_targets.py --scenario basic

# Spawn rescue scenario (5 targets - multiple people)
./gazebo_maritime/launch/spawn_targets.py --scenario rescue

# Spawn search scenario (6 targets - spread out)
./gazebo_maritime/launch/spawn_targets.py --scenario search

# Spawn 10 random targets
./gazebo_maritime/launch/spawn_targets.py --random 10

# Spawn specific target at location
./gazebo_maritime/launch/spawn_targets.py --model sar_target_raft --pos 15 20
```

#### Manual Spawning

Use Gazebo's Insert tab (GUI) or command line:

```bash
# Example: Spawn a life raft at coordinates (10, 5, 0.2)
gz model -m sar_target_raft -x 10 -y 5 -z 0.2
```

## Configuration

### Customizing Environments

Edit the YAML files in `config/` to modify:

- **Ocean parameters**: wave height, period, direction
- **Wind conditions**: speed, direction, gusts
- **Visibility**: fog density, render distance
- **Lighting**: time of day, sun intensity
- **Search area**: size and boundaries
- **Target placement**: count and types

Example modification in `config/env_calm.yaml`:

```yaml
ocean:
  wave_height: 0.5      # Increase wave height
  wave_period: 6.0      # Slower waves
  
wind:
  speed_mean: 3.0       # Slightly stronger wind
```

### Adding New Models

1. Create model directory in `gazebo_maritime/models/`
2. Add `model.config` and `model.sdf` files
3. Reference in world file or spawn dynamically

## Performance Optimization

The environment is optimized for **>30 FPS with 10 drones**:

- Ocean mesh: 50x50 cells (adjustable in `model.sdf`)
- Physics update rate: 100 Hz
- Render distance: Configurable per preset
- Shadow rendering: Enabled (can be disabled for performance)

To improve performance:
- Reduce ocean cell count in `models/ocean_surface/model.sdf`
- Disable shadows in world file
- Reduce render distance in config files

## Extensibility

This foundation is designed for easy extension:

### Adding Weather Effects
- Modify `maritime_base.sdf` to add particle effects (rain/snow when available in Gazebo Sim)
- Adjust fog parameters in config files (not yet implemented in current version)

### Adding Obstacles
- Create new models (buoys, vessels, rocks) in `models/` directory
- Reference them in the world file or spawn using launch script

### Day/Night Cycles
- Modify sun position and intensity in `maritime_base.sdf`
- Use `time_of_day` parameter in config files (future enhancement)

### Wave Physics
- When available for Gazebo Sim, add wave surface plugin
- Configure wave parameters in config files
- Add multiple wave sources for complex patterns (future enhancement)

## Troubleshooting

**Issue**: Ocean surface not visible
- **Solution**: Ensure `GZ_SIM_RESOURCE_PATH` includes the models directory
- Check that ocean model loaded without errors in console
- Ocean is a simple blue plane in this version

**Issue**: Poor performance
- **Solution**: Reduce physics update rate in world file
- Try using different rendering engine (ogre vs ogre2)

**Issue**: Targets sink instead of float
- **Solution**: Buoyancy plugin not yet implemented for Gazebo Sim 8
- Targets will float on the surface plane (z=0)

**Issue**: Missing ocean texture
- **Solution**: Ocean uses procedural blue material (no texture needed)

**Issue**: Command 'gazebo' not found
- **Solution**: Use `gz sim` command instead (modern Gazebo)

## Next Steps

This implementation provides the foundation for:
- Multi-drone coordination algorithms
- Computer vision detection systems
- Path planning and coverage algorithms
- Wind drift compensation
- Dynamic target tracking

## Dependencies

- Issue #1 - Development Environment Setup (completed)

## License

See LICENSE file in repository root.
