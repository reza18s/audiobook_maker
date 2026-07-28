@echo off

set REPO_NAME=audiobook_maker

if not exist "runtime" (
    @echo ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    @echo ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    echo This is not the packaged version, if you are trying to update your manual installation, please use git pull instead
    @echo ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    @echo ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    pause
    exit /b
)

set PATH=%~dp0portable_git\bin;%PATH%

cd %REPO_NAME%
git submodule init
git submodule update --remote

REM Store the cloned head commit hash
for /f %%i in ('git rev-parse HEAD') do set cloned_head=%%i
cd ..

REM Store the current head commit hash
for /f %%i in ('git rev-parse HEAD') do set current_head=%%i

@echo Latest Version = %cloned_head%
@echo Current Version = %current_head%

if "%current_head%"=="" (
    echo Continuing with update, no current version
) else if "%cloned_head%"=="%current_head%" (
    @echo ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    @echo ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    @echo The versions are the same; there is no new update.
    @echo Only proceed if you understand what you're doing. If not, type N to exit the script and stop updating.
    choice /M "Do you want to continue?"
    if errorlevel 2 (
        @echo Exiting the script...
        exit /b
    )
)

xcopy %REPO_NAME%\update_package.bat update_package.bat /Y
xcopy %REPO_NAME%\requirements.txt requirements.txt /Y
xcopy %REPO_NAME%\.git .git /E /I /H /Y

xcopy %REPO_NAME%\src src /E /I /H /Y
xcopy %REPO_NAME%\configs configs /E /I /H /Y
xcopy %REPO_NAME%\modules\F5-TTS modules\F5-TTS /E /I /H /Y

REM Start of F5TTS install
runtime\python.exe -m pip uninstall -y f5_tts
runtime\python.exe -m pip install modules\F5-TTS


REM Start of RVC install
runtime\python.exe -m pip uninstall -y rvc-python
runtime\python.exe -m pip install %REPO_NAME%\modules\rvc-python

REM Check torch and reinstall if needed
for /f "tokens=2" %%a in ('runtime\python.exe -m pip show torch ^| findstr "^Version:"') do set CURRENT_VERSION=%%a

set TARGET_VERSION=2.7.0+cu128
echo Current torch version: %CURRENT_VERSION%
echo Target torch version: %TARGET_VERSION%

if "%CURRENT_VERSION%" == "%TARGET_VERSION%" (
    echo Torch is already at the target version %TARGET_VERSION%, no action needed.
) else (
    echo Torch is not at the target version.
    runtime\python.exe -m pip uninstall -y torch
    runtime\python.exe -m pip install torch==2.7.0 torchvision==0.22.0 torchaudio==2.7.0 --index-url https://download.pytorch.org/whl/cu128
)

runtime\python.exe -m pip install -r requirements.txt

mkdir voices\f5tts

mkdir engines\f5tts\duration
mkdir engines\f5tts\models
mkdir engines\f5tts\tokenizers
mkdir engines\f5tts\vocoders

@echo ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
@echo ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
@echo Finished updating!
@echo ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
@echo ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

pause
