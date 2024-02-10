import os
os.system("sphinx-apidoc -f -o docs/matching python/matching/ICU")
os.system("sphinx-apidoc -f -o docs/vitaldb python/vitaldb-pypi/vitaldb")
os.system("sphinx-build docs docs/_build")
