#!/bin/bash
# Setup script for Maritime SAR Gazebo Environment

echo "=== Maritime SAR Environment Setup ==="
echo ""

# Check if Gazebo is installed
if ! command -v gz &> /dev/null; then
    echo "❌ Gazebo (gz) not found!"
    echo "   You appear to have ROS Jazzy installed which includes Gazebo."
    echo "   If not installed, run: sudo apt install gz-harmonic"
    exit 1
fi

echo "✓ Gazebo found: $(gz sim --version | head -n1)"

# Check Python version
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found!"
    exit 1
fi

echo "✓ Python found: $(python --version)"

# Check PyYAML
if ! python -c "import yaml" &> /dev/null; then
    echo "⚠ PyYAML not installed"
    echo "  Installing PyYAML..."
    pip install pyyaml
else
    echo "✓ PyYAML installed"
fi

# Set up Gazebo model path
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
MODEL_PATH="$SCRIPT_DIR/models"

echo ""
echo "=== Setting Gazebo Model Path ==="
echo "Add this line to your ~/.bashrc:"
echo ""
echo "export GZ_SIM_RESOURCE_PATH=$MODEL_PATH:\$GZ_SIM_RESOURCE_PATH"
echo ""

# Make scripts executable
chmod +x "$SCRIPT_DIR/launch/launch_maritime.py"
chmod +x "$SCRIPT_DIR/launch/spawn_targets.py"

echo "✓ Launch scripts are executable"
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Quick Start:"
echo "  1. Add the export line above to ~/.bashrc (or run it in your terminal)"
echo "  2. Launch environment: ./gazebo_maritime/launch/launch_maritime.py --env calm"
echo "  3. Spawn targets (new terminal): ./gazebo_maritime/launch/spawn_targets.py --scenario basic"
echo ""
