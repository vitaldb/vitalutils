sphinx-apidoc -f -o docs/source/matching python/matching/ICU
sphinx-apidoc -f -o docs/source/vitaldb python/vitaldb-pypi/vitaldb
call %~dp0\docs\make.bat html
PAUSE
