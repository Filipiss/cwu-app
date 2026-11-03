# CWU App (Clean Windows Utility) 🚀

> **Assistente Pós-Formatação & Gerenciador Inteligente de Drivers e Diagnóstico**

O **CWU App** é uma ferramenta desktop gratuita, leve e sem bloatware, desenvolvida especificamente para facilitar e acelerar a configuração de computadores recém-formatados. Inspirado em utilitários como o Driver Booster, porém com foco em transparência, privacidade, links oficiais diretos e zero anúncios.

---

## 📋 Sumário

- [Visão Geral](#-visão-geral)
- [Funcionalidades Principais](#-funcionalidades-principais)
- [Lista de Softwares & Runtimes Pós-Formatação](#-lista-de-softwares--runtimes-pós-formatação)
- [Arquitetura do Projeto](#-arquitetura-do-projeto)
- [Metodologia de Frontend (BEMIT)](#-metodologia-de-frontend-bemit)
- [Estrutura de Pastas](#-estrutura-de-pastas)
- [Tecnologias Utilizadas](#-tecnologias-utilizadas)
- [Instalação e Execução](#-instalação-e-execução)
- [Roadmap](#-roadmap)
- [Licença](#-licença)

---

## 🎯 Visão Geral

Após formatar o Windows, os usuários frequentemente enfrentam dificuldades para localizar drivers corretos, runtimes essenciais para jogos e programas (DirectX, Visual C++ Redistributable), além de monitorar a saúde do hardware ou diagnosticar telas azuis (BSOD).

O **CWU App** resolve isso reunindo diagnóstico de hardware com pontuação (benchmark simplificado), verificação e redirecionamento para drivers oficiais, análise preditiva de logs do Windows e otimização para jogos.

---

## ✨ Funcionalidades Principais

| Módulo | Descrição |
| :--- | :--- |
| **System Specs** | Varredura de hardware (Processador, Placa de Vídeo, Memória RAM, Armazenamento, Placa-Mãe e Versão do Windows). Atribui uma nota de 0 a 10 para cada componente e gera uma pontuação geral do sistema. |
| **Driver Scan** | Inspeção dos dispositivos do computador via WMI/PowerShell, identificando componentes com drivers genéricos, desatualizados ou com erro de dispositivo. |
| **Driver Update** | Exibição de drivers desatualizados com atalhos diretos e confiáveis para as páginas oficiais dos fabricantes (Intel, AMD, NVIDIA, Realtek, etc.). |
| **Boost (Modo Gamer)** | Otimizador de desempenho em demonstração, permitindo simular encerramento de processos em segundo plano, liberação de memória RAM e suspensão de telemetria desnecessária. |
| **Logs de Erros (BSOD & Eventos)** | Consulta automática ao Visualizador de Eventos do Windows (`Get-WinEvent` / Kernel-Power ID 41, BugCheck, Application Hang/Crash) com explicações humanas sobre a causa provável de desligamentos ou telas azuis. |
| **Settings (Configurações)** | Gerenciamento de temas visuais (Dark Mode, Cyberpunk/Neon, Minimal Light), idioma (Português/Inglês) e preferências de notificações. |
| **New Versions** | Verificador de atualizações do próprio CWU App para manter a ferramenta sempre em sua versão mais recente. |

---

## 📦 Lista de Softwares & Runtimes Pós-Formatação

Runtimes e utilitários indispensáveis recomendados logo após uma formatação:

### 1. Runtimes & Bibliotecas de Execução (Obrigatórios para jogos e programas)
- **Visual C++ Redistributable All-in-One**: Pacotes de 2005 a 2022 (x86 e x64) necessários para que 90% dos jogos e instaladores não apresentem erros de `.dll` ausente.
- **DirectX End-User Runtimes (June 2010)**: Bibliotecas legadas do DirectX 9/10/11 necessárias para jogos clássicos e modernos.
- **.NET Desktop Runtime**: Versões 6.0, 7.0 e 8.0 para suporte a softwares modernos desenvolvidos em C#/.NET.
- **Java Runtime Environment (JRE) / OpenJDK**: Para softwares legados e emuladores específicos.

### 2. Drivers de Sistema Críticos
- **Driver de Chipset da Placa-Mãe** (AMD Chipset Drivers / Intel INF Update Utility).
- **Driver de Placa de Vídeo Dedicada / Integrada** (NVIDIA Game Ready / AMD Software: Adrenalin Edition / Intel Arc Graphics).
- **Driver de Rede e Wi-Fi** (Realtek PCIe GbE, Intel Wi-Fi / Killer, MediaTek).
- **Driver de Áudio de Alta Definição** (Realtek HD Audio Driver).

### 3. Utilitários Essenciais de Uso Diário
- **Compactadores de Arquivo**: 7-Zip ou WinRAR.
- **Navegador Web**: Brave, Chrome, Firefox ou Edge.
- **Leitor de Documentos**: SumatraPDF ou Adobe Acrobat Reader.
- **Comunicação & Mídia**: Discord, VLC Media Player, Spotify.
- **Plataformas de Jogos**: Steam, Epic Games Launcher, GOG Galaxy.

---

## 🏛 Arquitetura do Projeto

O CWU App é projetado para operar como uma aplicação desktop nativa.

```
+-------------------------------------------------------------------+
|                        CWU App (Frontend)                         |
|   HTML5 + Vanilla CSS (Metodologia BEMIT) + JavaScript Moderno    |
|   Temas Dinâmicos (CSS Custom Properties) + Micro-interações       |
+---------------------------------+---------------------------------+
                                  | (REST / IPC)
+---------------------------------v---------------------------------+
|                        CWU Core (Backend)                         |
|   Node.js Desktop Runtime / Express Core                          |
|   - Hardware Scanner Service (WMI / PowerShell CIM)               |
|   - Driver Detector Service (PnP Devices & DriverQuery)           |
|   - Event Viewer Log Analyzer (BugCheck / Kernel-Power Parser)    |
|   - Scoring Engine (Cálculo de Notas de Hardware)                 |
+---------------------------------+---------------------------------+
                                  |
+---------------------------------v---------------------------------+
|                       Local Database (SQLite)                     |
|   - Histórico de Scans e Logs                                     |
|   - Banco local de fabricantes e links oficiais                   |
|   - Configurações e preferências do usuário                       |
+-------------------------------------------------------------------+
```

> **Nota sobre Docker:** Como o aplicativo tem a finalidade precípua de consultar hardware local, drivers PnP e o Visualizador de Eventos do Windows da máquina física recém-formatada, a execução padrão é feita **diretamente no sistema operacional** (Node.js nativo / empacotamento desktop). Para ambientes de desenvolvimento ou demonstração web, inclui-se suporte opcional via `Dockerfile` e `docker-compose.yml`.

---

## 🎨 Metodologia de Frontend (BEMIT)

A camada de apresentação utiliza a metodologia **BEMIT** (fusão de BEM - *Block Element Modifier* com a hierarquia arquitetural do *ITCSS*), garantindo código CSS limpo, escalável e previsível:

1. **Settings (`s-` / Sass/CSS variables)**: Paletas de cores HSL, variáveis de tipografia, espaçamentos e tokens.
2. **Tools**: Mixins, funções auxiliares de layout e media queries.
3. **Generic**: Normalização e Box-sizing.
4. **Elements**: Estilizações puras de tags base (`h1`, `p`, `button`, `input`).
5. **Objects (`o-` / OOCSS)**: Estruturas de layout agnósticas a design (ex: `o-grid`, `o-container`, `o-card`).
6. **Components (`c-` / BEM)**: Componentes com estilos visuais específicos (ex: `c-sidebar`, `c-specs-card`, `c-score-badge`).
7. **Utilities (`u-` / Classes utilitárias)**: Auxiliares de alta especificidade (ex: `u-text-center`, `u-hidden`).

---

## 📁 Estrutura de Pastas

```text
cwu-app/
├── backend/
│   ├── src/
│   │   ├── config/             # Configurações do ambiente e constantes
│   │   ├── controllers/        # Controladores que recebem requisições da UI
│   │   ├── database/           # Conexão SQLite local, migrações e seed inicial
│   │   ├── models/             # Schemas/Entidades locais
│   │   ├── routes/             # Definição dos endpoints da API local
│   │   ├── services/           # Lógica de negócio (WMI, Drivers, Logs, Specs)
│   │   └── utils/              # Funções utilitárias (parsers, pontuações)
│   ├── package.json
│   └── server.js               # Ponto de entrada do backend
├── frontend/
│   ├── assets/                 # Ícones, imagens e recursos visuais
│   ├── scripts/                # Controladores do frontend e interações
│   │   ├── api.js              # Comunicação com o backend local
│   │   ├── app.js              # Inicialização e roteamento de abas
│   │   └── modules/            # Módulos por tela (specs, scan, update, logs)
│   ├── styles/                 # Arquitetura BEMIT
│   │   ├── 1-settings/         # Variáveis e temas (Dark, Light, Cyber)
│   │   ├── 2-tools/            # Helpers
│   │   ├── 3-generic/          # Reset e Box-sizing
│   │   ├── 4-elements/         # Elementos HTML base
│   │   ├── 5-objects/          # Objetos de layout (grid, wrappers)
│   │   ├── 6-components/       # Blocos BEM (sidebar, cards, tables, badges)
│   │   ├── 7-utilities/        # Classes utilitárias
│   │   └── main.css            # Arquivo principal agregador
│   └── index.html              # Interface do aplicativo
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── .gitignore
└── README.md
```

---

## 🛠 Tecnologias Utilizadas

- **Frontend**: HTML5 Semântico, Vanilla JavaScript (ES6+), Vanilla CSS estruturado em BEMIT.
- **Backend**: Node.js, Express.js.
- **Acesso ao Sistema Operacional**: PowerShell CIM / WMI Scripts nativos (`Get-CimInstance`, `Get-PnpDevice`, `Get-WinEvent`).
- **Banco de Dados Local**: SQLite3 com inicialização automática (`better-sqlite3` ou `sqlite3`).
- **Containerização**: Docker & Docker Compose (para ambientes de homologação/demonstração).

---

## 🚀 Instalação e Execução

### Pré-requisitos
- Windows 10 ou 11 (64-bit).
- [Node.js](https://nodejs.org/) versão 18+ instalada.

### Modo Local (Recomendado para leitura completa do Windows)
```bash
# 1. Clone ou acesse a pasta do repositório
cd "CWU app"

# 2. Instale as dependências do backend
cd backend
npm install

# 3. Inicie o servidor local do CWU App
npm start

# 4. Abra a interface no navegador ou empacote via Electron
# Acesse: http://localhost:4321
```

---

## 🗺 Roadmap

- [x] Planejamento e definição dos módulos essenciais pós-formatação
- [x] Estruturação da arquitetura BEMIT e backend modular
- [ ] Implementação do serviço de varredura de hardware e pontuação (Specs Engine)
- [ ] Implementação da varredura de drivers e tabela de fabricantes oficiais
- [ ] Módulo leitor e tradutor de erros do Visualizador de Eventos (BSOD / Kernel-Power)
- [ ] Interface gráfica com seletor de temas (Dark / Cyber / Light)
- [ ] Módulo Boost para encerramento de processos não críticos
- [x] Empacotamento em executável desktop com Electron (janela nativa e modo portátil `.exe`)

---

## 📄 Licença

Distribuído sob a licença MIT. Livre para uso pessoal e modificações.
