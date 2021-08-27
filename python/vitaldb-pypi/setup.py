import setuptools
 
setuptools.setup(
    name="vitaldb",
    version="0.0.5",
    author="VitalLab",
    author_email="vital@snu.ac.kr",
    description="VitalDB Python Libray",
    long_description="",
    long_description_content_type="text/markdown",
    url="https://github.com/vitaldb/vitalutils",
    install_requires=['numpy','pandas','requests'],
    packages=setuptools.find_packages(),
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
)