import os
import shutil

PROJECT_NAME = 'vitaldb'

# generate docs
os.system("sphinx-apidoc -f -o ../../docs/matching ../matching/ICU")
os.system("sphinx-apidoc -f -o ../../docs/vitaldb vitaldb")
os.system("sphinx-build ../../docs ../../docs/_build")

# create wheel
f = open("setup.py", "rt")
ver = ''
for line in f.readlines():
    if line.find('version=') > 0:
        tabs = line.strip().split('=')
        if len(tabs) >= 2:
            ver = tabs[1].strip('",')
if not ver:
    print('version not found in setup.py')
    quit()
os.system('python setup.py bdist_wheel')

# upload to pypi
os.system('twine upload dist\\' + PROJECT_NAME + '-' + ver + '-py3-none-any.whl')

# remove cache dirs
print('removing cache dirs', end='...', flush=True)
shutil.rmtree('build')
shutil.rmtree(PROJECT_NAME + '.egg-info')
shutil.rmtree('dist')
print('done')