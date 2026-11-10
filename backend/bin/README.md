# PresentMon (FPS da sobreposição)

O CWU App mede o FPS do jogo em primeiro plano com o **PresentMon**, ferramenta open source
da Intel (licença MIT): https://github.com/GameTechDev/PresentMon

Ele lê os eventos de apresentação de frames que o próprio Windows registra (ETW).
Não injeta nada no jogo e não instala driver.

## Como incluir
1. Baixe o aplicativo de console em https://github.com/GameTechDev/PresentMon/releases
   (arquivo `PresentMon-<versão>-x64.exe`).
2. Coloque o arquivo nesta pasta (`backend/bin`). Qualquer nome que comece com `PresentMon` e termine em `.exe` funciona.
3. No build, o electron-builder copia esta pasta para `resources/bin` do executável.

Copyright (C) 2017-2024 Intel Corporation. Distribuído sob a licença MIT
(texto completo em https://github.com/GameTechDev/PresentMon/blob/main/LICENSE.txt).
