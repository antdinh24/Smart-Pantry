@echo off
REM Smart Pantry Test Runner for Windows
REM Quick script to run tests with common options

echo.
echo 🧪 Smart Pantry Test Runner
echo ================================
echo.

REM Check if virtual environment is activated
if "%VIRTUAL_ENV%"=="" (
    echo ⚠️  Virtual environment not activated!
    echo Run: venv\Scripts\activate
    exit /b 1
)

REM Parse command line arguments
if "%1"=="unit" (
    echo Running unit tests only...
    pytest -m unit -v
) else if "%1"=="integration" (
    echo Running integration tests only...
    pytest -m integration -v
) else if "%1"=="fast" (
    echo Running fast tests only...
    pytest -m "not slow" -v
) else if "%1"=="coverage" (
    echo Running tests with coverage report...
    pytest --cov=app --cov-report=html --cov-report=term
    echo.
    echo 📊 Coverage report generated in htmlcov\index.html
) else if "%1"=="failed" (
    echo Re-running last failed tests...
    pytest --lf -v
) else if "%1"=="verbose" (
    echo Running all tests verbose...
    pytest -v -s
) else if "%1"=="help" (
    echo Usage: run_tests.bat [option]
    echo.
    echo Options:
    echo   unit         - Run only unit tests
    echo   integration  - Run only integration tests
    echo   fast         - Run fast tests exclude slow
    echo   coverage     - Run with coverage report
    echo   failed       - Re-run last failed tests
    echo   verbose      - Run all tests with verbose output
    echo   help         - Show this help message
    echo.
    echo No option = Run all tests
) else (
    echo Running all tests...
    pytest
)

echo.
echo ✅ Test run complete!
