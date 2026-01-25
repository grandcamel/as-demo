from setuptools import setup

setup(
    name='as-demo-shared',
    version='1.0.0',
    description='Shared dependencies for AS-Demo Splunk services',
    py_modules=['splunk_events'],
    install_requires=[
        'requests>=2.28.0',
        'faker>=18.0.0',
        'urllib3>=1.26.0',
    ],
)
