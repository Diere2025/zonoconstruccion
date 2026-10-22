@echo off
timeout /t 5 /nobreak >nul

set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

:: 1. diegoboveda.mp (Default)
start "" "%CHROME%" --profile-directory="Default" --new-window "https://www.mercadopago.com.ar/activities" "https://www.mercadopago.com.ar/banking/movements" "https://www.mercadopago.com.ar/savings/movements/000101a7-1f12-4102-9d9e-871da7f7b326"

timeout /t 3 /nobreak >nul

:: 2. Normes / MP4 (Profile 6)
start "" "%CHROME%" --profile-directory="Profile 6" --new-window "https://www.mercadopago.com.ar/activities" "https://www.mercadopago.com.ar/banking/movements" "https://www.mercadopago.com.ar/savings/movements/7b241292-a4d8-46ca-9fa2-9ea6b61427fa"

timeout /t 3 /nobreak >nul

:: 3. Daiana (Profile 3)
start "" "%CHROME%" --profile-directory="Profile 3" --new-window "https://www.mercadopago.com.ar/activities" "https://www.mercadopago.com.ar/banking/movements"

exit
