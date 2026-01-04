#!/usr/bin/env python3
"""
Standalone target spawner for maritime SAR environment
Spawns targets using Gazebo command line tools (no ROS required)
"""

import os
import sys
import random
import argparse
import time
import subprocess

def get_model_path(model_name):
    """Get the absolute path to a model directory"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.join(os.path.dirname(script_dir), 'models')
    return os.path.join(models_dir, model_name)

def spawn_model(model_name, x, y, z=0.2, world_name='maritime_sar'):
    """Spawn a model at given coordinates using gz service"""
    model_path = get_model_path(model_name)
    sdf_file = os.path.join(model_path, 'model.sdf')
    
    if not os.path.exists(sdf_file):
        print(f"[ERROR] Model file not found: {sdf_file}")
        return False
    
    instance_name = f"{model_name}_{abs(int(x))}_{abs(int(y))}"
    
    print(f"[SPAWN] {model_name} at ({x:.1f}, {y:.1f}, {z:.1f})")
    
    request = f'sdf_filename: "{sdf_file}", name: "{instance_name}", pose: {{position: {{x: {x}, y: {y}, z: {z}}}}}'
    
    cmd = [
        'gz', 'service',
        '-s', f'/world/{world_name}/create',
        '--reqtype', 'gz.msgs.EntityFactory',
        '--reptype', 'gz.msgs.Boolean',
        '--timeout', '5000',
        '--req', request
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            print(f"[WARNING] Spawn may have failed.")
            print(f"  stderr: {result.stderr}")
            print(f"  stdout: {result.stdout}")
            return False
        if result.stdout:
            print(f"  Response: {result.stdout.strip()}")
        time.sleep(0.5)  # Small delay between spawns
        return True
    except Exception as e:
        print(f"[ERROR] Failed to spawn model: {e}")
        return False

def spawn_random_targets(count=5, area_size=100):
    """Spawn random targets in the search area"""
    
    target_types = [
        'sar_target_person',
        'sar_target_raft', 
        'sar_target_debris'
    ]
    
    print(f"\n[INFO] Spawning {count} random targets in {area_size}x{area_size}m area")
    
    for i in range(count):
        target_type = random.choice(target_types)
        x = random.uniform(-area_size/2, area_size/2)
        y = random.uniform(-area_size/2, area_size/2)
        z = 0.2  # Just sliiiightly above water surface
        
        spawn_model(target_type, x, y, z)
    
    print(f"\n[INFO] Successfully spawned {count} targets")

def spawn_preset_scenario(scenario='basic'):
    """Spawn predefined target scenarios"""
    
    scenarios = {
        'basic': [
            ('sar_target_raft', 10, 5, 0.2),
            ('sar_target_person', -15, 8, 0.1),
            ('sar_target_debris', 20, -10, 0.1),
        ],
        'rescue': [
            ('sar_target_person', 0, 0, 0.1),
            ('sar_target_person', 5, 3, 0.1),
            ('sar_target_raft', 10, -5, 0.2),
            ('sar_target_debris', -8, 7, 0.1),
            ('sar_target_debris', 12, 10, 0.1),
        ],
        'search': [
            ('sar_target_debris', 15, 20, 0.1),
            ('sar_target_debris', -10, 15, 0.1),
            ('sar_target_debris', 25, -5, 0.1),
            ('sar_target_person', 30, 10, 0.1),
            ('sar_target_raft', -20, -15, 0.2),
            ('sar_target_person', -25, 5, 0.1),
        ]
    }
    
    if scenario not in scenarios:
        print(f"[ERROR] Unknown scenario: {scenario}")
        print(f"Available scenarios: {', '.join(scenarios.keys())}")
        sys.exit(1)
    
    print(f"\n[INFO] Spawning scenario: {scenario}")
    for model_name, x, y, z in scenarios[scenario]:
        spawn_model(model_name, x, y, z)
    
    print(f"\n[INFO] Scenario '{scenario}' deployed successfully")

def main():
    parser = argparse.ArgumentParser(
        description='Spawn SAR targets in Gazebo maritime environment',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Spawn basic scenario (3 targets)
  ./spawn_targets.py --scenario basic
  
  # Spawn rescue scenario (5 targets)
  ./spawn_targets.py --scenario rescue
  
  # Spawn 10 random targets
  ./spawn_targets.py --random 10
  
  # Spawn single target at specific location
  ./spawn_targets.py --model sar_target_raft --pos 15 20
        """
    )
    
    parser.add_argument('--scenario', '-s',
                       choices=['basic', 'rescue', 'search'],
                       help='Spawn predefined scenario')
    parser.add_argument('--random', '-r', type=int, metavar='COUNT',
                       help='Spawn COUNT random targets')
    parser.add_argument('--area', type=int, default=100,
                       help='Search area size for random spawning (default: 100m)')
    parser.add_argument('--model', '-m',
                       choices=['sar_target_person', 'sar_target_raft', 'sar_target_debris'],
                       help='Spawn specific model type')
    parser.add_argument('--pos', nargs=2, type=float, metavar=('X', 'Y'),
                       help='Position for single model spawn')
    
    args = parser.parse_args()
    
    check_cmd = "gz topic -l 2>/dev/null | grep -q '/world/maritime_sar'"
    if os.system(check_cmd) != 0:
        print("[WARNING] Gazebo may not be running!")
        print("          Start Gazebo first: ./gazebo_maritime/launch/launch_maritime.py")
        print("          Then run this script in a new terminal\n")
    
    if args.scenario:
        spawn_preset_scenario(args.scenario)
    elif args.random:
        spawn_random_targets(args.random, args.area)
    elif args.model and args.pos:
        spawn_model(args.model, args.pos[0], args.pos[1])
    else:
        print("[INFO] No arguments provided, spawning basic scenario")
        spawn_preset_scenario('basic')

if __name__ == '__main__':
    main()
