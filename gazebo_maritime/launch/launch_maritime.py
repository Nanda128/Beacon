#!/usr/bin/env python3
"""
Maritime SAR Environment Launcher
Spawns Gazebo world with configurable maritime conditions
"""

import os
import sys
import yaml
import argparse
import tempfile
from pathlib import Path

def load_config(config_name):
    """Load environment configuration from YAML file"""
    config_dir = Path(__file__).parent.parent / 'config'
    config_file = config_dir / f'env_{config_name}.yaml'
    
    if not config_file.exists():
        print(f"Error: Configuration '{config_name}' not found at {config_file}")
        sys.exit(1)
    
    with open(config_file, 'r') as f:
        return yaml.safe_load(f)

def generate_sdf_from_config(config):
    """Generate SDF world file from configuration"""
    
    lighting = config.get('lighting', {})
    ocean = config.get('ocean', {})
    visibility = config.get('visibility', {})
    
    ambient = lighting.get('ambient_light', [0.4, 0.4, 0.4])
    sky_color = lighting.get('sky_color', [0.5, 0.7, 0.9])
    sun_intensity = lighting.get('sun_intensity', 0.8)
    
    wave_height = ocean.get('wave_height', 0.3)
    
    fog_enabled = visibility.get('fog_enabled', False)
    fog_density = visibility.get('fog_density', 0.005)
    fog_color = visibility.get('fog_color', [0.7, 0.7, 0.7])
    
    fog_section = ""
    if fog_enabled:
        fog_section = f"""
      <fog>
        <type>linear</type>
        <color>{fog_color[0]} {fog_color[1]} {fog_color[2]} 1</color>
        <density>{fog_density}</density>
        <start>10</start>
        <end>{visibility.get('render_distance', 200)}</end>
      </fog>"""
    
    # Calculate ocean color based on wave height (rougher = darker/greener)
    wave_factor = min(wave_height / 3.0, 1.0)  # Normalize to 0-1
    ocean_ambient_r = 0.2 - (wave_factor * 0.1)
    ocean_ambient_g = 0.3 - (wave_factor * 0.05)
    ocean_ambient_b = 0.5 - (wave_factor * 0.1)
    
    ocean_diffuse_r = 0.2 - (wave_factor * 0.1)
    ocean_diffuse_g = 0.4 - (wave_factor * 0.15)
    ocean_diffuse_b = 0.7 - (wave_factor * 0.2)
    
    sdf_content = f"""<?xml version="1.0" ?>
<sdf version="1.8">
  <world name="maritime_sar">
    
    <physics name="1ms" type="ignored">
      <max_step_size>0.001</max_step_size>
      <real_time_factor>1.0</real_time_factor>
    </physics>

    <plugin
      filename="gz-sim-physics-system"
      name="gz::sim::systems::Physics">
    </plugin>

    <plugin
      filename="gz-sim-user-commands-system"
      name="gz::sim::systems::UserCommands">
    </plugin>

    <plugin
      filename="gz-sim-scene-broadcaster-system"
      name="gz::sim::systems::SceneBroadcaster">
    </plugin>

    <scene>
      <ambient>{ambient[0]} {ambient[1]} {ambient[2]} 1</ambient>
      <background>{sky_color[0]} {sky_color[1]} {sky_color[2]} 1</background>
      <sky></sky>
      <grid>false</grid>{fog_section}
    </scene>

    <light type="directional" name="sun">
      <cast_shadows>true</cast_shadows>
      <pose>0 0 100 0 0 0</pose>
      <diffuse>{sun_intensity} {sun_intensity} {sun_intensity} 1</diffuse>
      <specular>0.2 0.2 0.2 1</specular>
      <attenuation>
        <range>1000</range>
      </attenuation>
      <direction>-0.5 0.1 -0.9</direction>
    </light>

    <model name="ocean_surface">
      <static>true</static>
      <link name="ocean_link">
        <pose>0 0 0 0 0 0</pose>
        <visual name="ocean_visual">
          <geometry>
            <plane>
              <size>1000 1000</size>
              <normal>0 0 1</normal>
            </plane>
          </geometry>
          <material>
            <ambient>{ocean_ambient_r} {ocean_ambient_g} {ocean_ambient_b} 1</ambient>
            <diffuse>{ocean_diffuse_r} {ocean_diffuse_g} {ocean_diffuse_b} 1</diffuse>
            <specular>0.8 0.8 0.8 1</specular>
          </material>
        </visual>
        <collision name="ocean_collision">
          <geometry>
            <plane>
              <size>1000 1000</size>
              <normal>0 0 1</normal>
            </plane>
          </geometry>
          <surface>
            <friction>
              <ode>
                <mu>0.01</mu>
                <mu2>0.01</mu2>
              </ode>
            </friction>
          </surface>
        </collision>
      </link>
    </model>

    <gui fullscreen="0">
      <plugin filename="GzScene3D" name="3D View">
        <gz-gui>
          <title>3D View</title>
          <property type="bool" key="showTitleBar">false</property>
          <property type="string" key="state">docked</property>
        </gz-gui>

        <engine>ogre2</engine>
        <scene>scene</scene>
        <ambient_light>{ambient[0]} {ambient[1]} {ambient[2]}</ambient_light>
        <background_color>{sky_color[0]} {sky_color[1]} {sky_color[2]}</background_color>
        <camera_pose>50 -50 30 0 0.3 2.35</camera_pose>
      </plugin>

      <plugin filename="WorldControl" name="World control">
        <gz-gui>
          <title>World control</title>
          <property type="bool" key="showTitleBar">false</property>
          <property type="bool" key="resizable">false</property>
          <property type="double" key="height">72</property>
          <property type="double" key="width">121</property>
          <property type="double" key="z">1</property>

          <property type="string" key="state">floating</property>
          <anchors target="3D View">
            <line own="left" target="left"/>
            <line own="bottom" target="bottom"/>
          </anchors>
        </gz-gui>

        <play_pause>true</play_pause>
        <step>true</step>
        <start_paused>false</start_paused>
      </plugin>

      <plugin filename="WorldStats" name="World stats">
        <gz-gui>
          <title>World stats</title>
          <property type="bool" key="showTitleBar">false</property>
          <property type="bool" key="resizable">false</property>
          <property type="double" key="height">110</property>
          <property type="double" key="width">290</property>
          <property type="double" key="z">1</property>

          <property type="string" key="state">floating</property>
          <anchors target="3D View">
            <line own="right" target="right"/>
            <line own="bottom" target="bottom"/>
          </anchors>
        </gz-gui>

        <sim_time>true</sim_time>
        <real_time>true</real_time>
        <real_time_factor>true</real_time_factor>
        <iterations>true</iterations>
      </plugin>

      <plugin filename="EntityTree" name="Entity tree">
      </plugin>

    </gui>

  </world>
</sdf>
"""
    return sdf_content


def generate_launch_command(config, world_file):
    """Generate Gazebo launch command with environment parameters"""
    
    model_path = str(Path(__file__).parent.parent / 'models')
    
    env_vars = f'GZ_SIM_RESOURCE_PATH={model_path}:$GZ_SIM_RESOURCE_PATH'
    
    cmd = f'{env_vars} gz sim {world_file}'
    
    cmd += ' -v 4'
    
    return cmd

def spawn_targets(config):
    """Spawn SAR targets based on configuration"""
    if not config.get('targets', {}).get('spawn_enabled', False):
        return
    
    print("\n[INFO] To spawn targets, use Gazebo GUI (Insert tab) or:")
    print("      gz model -m sar_target_raft -x 10 -y 5 -z 0.2")
    print("      gz model -m sar_target_person -x -15 -y 8 -z 0.1")
    print("      gz model -m sar_target_debris -x 20 -y -10 -z 0.1")

def main():
    parser = argparse.ArgumentParser(description='Launch Maritime SAR Environment')
    parser.add_argument('--env', '-e', 
                       choices=['calm', 'moderate', 'rough'],
                       default='calm',
                       help='Environment preset to load')
    parser.add_argument('--gui', action='store_true', default=True,
                       help='Launch with GUI (default: True)')
    
    args = parser.parse_args()
    
    print(f"[INFO] Loading environment: {args.env}")
    config = load_config(args.env)
    
    print(f"[INFO] Environment: {config['environment']['description']}")
    print(f"[INFO] Wave height: {config['ocean']['wave_height']}m")
    print(f"[INFO] Wind speed: {config['wind']['speed_mean']} m/s")
    
    # Generate dynamic SDF file from config
    print(f"[INFO] Generating world file from configuration...")
    sdf_content = generate_sdf_from_config(config)
    
    # Create temporary SDF file
    temp_dir = tempfile.gettempdir()
    temp_world_file = os.path.join(temp_dir, f'maritime_{args.env}.sdf')
    
    with open(temp_world_file, 'w') as f:
        f.write(sdf_content)
    
    print(f"[INFO] World file created: {temp_world_file}")
    
    launch_cmd = generate_launch_command(config, temp_world_file)
    print(f"\n[LAUNCH] {launch_cmd}\n")
    
    os.system(launch_cmd)
    
    spawn_targets(config)

if __name__ == '__main__':
    main()
