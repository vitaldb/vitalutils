sphinx-apidoc -f -o docs/matching python/matching/ICU
sphinx-apidoc -f -o docs/vitaldb python/vitaldb-pypi/vitaldb
call %~dp0\docs\make.bat html
start chrome "%~dp0/docs/_build/html/index.html"
PAUSE
