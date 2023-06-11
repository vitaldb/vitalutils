import os
import shutil

PROJECT_NAME = 'vitaldb'
os.chdir(os.path.dirname(os.path.abspath(__file__)))
print(os.getcwd())

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
os.system('twine upload dist\\' + PROJECT_NAME + '-' + ver + '-py3-none-any.whl')

print('removing cache dirs', end='...', flush=True)
shutil.rmtree('build')
shutil.rmtree(PROJECT_NAME + '.egg-info')
shutil.rmtree('dist')
print('done')