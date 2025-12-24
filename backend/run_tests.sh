#!/bin/bash

# Smart Pantry Test Runner
# Quick script to run tests with common options

set -e  # Exit on error

echo "🧪 Smart Pantry Test Runner"
echo "================================"
echo ""

# Check if virtual environment is activated
if [[ -z "$VIRTUAL_ENV" ]]; then
    echo "⚠️  Virtual environment not activated!"
    echo "Run: source venv/bin/activate (or venv\\Scripts\\activate on Windows)"
    exit 1
fi

# Parse command line arguments
case "$1" in
    "unit")
        echo "Running unit tests only..."
        pytest -m unit -v
        ;;
    "integration")
        echo "Running integration tests only..."
        pytest -m integration -v
        ;;
    "fast")
        echo "Running fast tests only (excluding slow tests)..."
        pytest -m "not slow" -v
        ;;
    "coverage")
        echo "Running tests with coverage report..."
        pytest --cov=app --cov-report=html --cov-report=term
        echo ""
        echo "📊 Coverage report generated in htmlcov/index.html"
        ;;
    "watch")
        echo "Running tests in watch mode..."
        echo "Tests will re-run when files change"
        pytest-watch
        ;;
    "failed")
        echo "Re-running last failed tests..."
        pytest --lf -v
        ;;
    "verbose")
        echo "Running all tests (verbose)..."
        pytest -v -s
        ;;
    "help")
        echo "Usage: ./run_tests.sh [option]"
        echo ""
        echo "Options:"
        echo "  unit         - Run only unit tests"
        echo "  integration  - Run only integration tests"
        echo "  fast         - Run fast tests (exclude slow)"
        echo "  coverage     - Run with coverage report"
        echo "  watch        - Run in watch mode"
        echo "  failed       - Re-run last failed tests"
        echo "  verbose      - Run all tests with verbose output"
        echo "  help         - Show this help message"
        echo ""
        echo "No option = Run all tests"
        ;;
    *)
        echo "Running all tests..."
        pytest
        ;;
esac

echo ""
echo "✅ Test run complete!"
