# 🚀 Testing Quick Start

## Run Tests (2 Commands)

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run tests
pytest
```

That's it! 🎉

---

## Expected Output

```
collected 14 items

tests/unit/test_config.py ......... [64%]
tests/unit/test_main.py .....      [100%]

========== 14 passed in 1.23s ==========
```

---

## Common Commands

```bash
pytest                    # Run all tests
pytest -m unit           # Unit tests only
pytest -v                # Verbose
pytest --cov=app         # With coverage
./run_tests.sh coverage  # Quick coverage report
```

---

## Writing Your First Test

**1. Open:** `tests/unit/test_pantry.py`

**2. Remove:** `@pytest.mark.skip` from a test

**3. Run:**
```bash
pytest tests/unit/test_pantry.py -v
```

**4. It fails** because endpoint doesn't exist yet

**5. Build the endpoint** in `app/routers/pantry.py`

**6. Run again** - it passes! ✅

---

## 📚 Full Documentation

- **Complete Guide:** `../TESTING.md`
- **Setup Summary:** `../TESTING_SETUP_COMPLETE.md`
- **This Directory:** `README.md`

---

Happy testing! 🧪✨
