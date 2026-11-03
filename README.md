<div align="center">

# CWU App — Clean Windows Utility

**Pós-formatação e otimização do Windows para jogos, em um único app. Sem placebo.**

[![Testes](https://github.com/Filipiss/cwu-app/actions/workflows/tests.yml/badge.svg)](https://github.com/Filipiss/cwu-app/actions/workflows/tests.yml)
![Versão](https://img.shields.io/badge/versão-1.0.0-blue)
![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D6?logo=windows)
![Electron](https://img.shields.io/badge/Electron-45-47848F?logo=electron)

[**⬇️ Baixar para Windows**](https://github.com/Filipiss/cwu-app/releases/latest)

<img src="docs/media/demo.gif" alt="CWU App em funcionamento" width="860">

</div>

## Por que existe

Depois de formatar um PC, você perde horas instalando drivers e programas e caçando "otimizações" na internet. Metade delas não faz nada e algumas pioram o sistema. O CWU App junta o que **realmente funciona** num só lugar: lê o hardware de verdade, instala o essencial em lote e aplica ajustes de jogo explicando o que cada um faz. Toda alteração é registrada e pode ser desfeita.

**Princípios:** nenhum dado inventado (se uma leitura falha, o app diz que falhou), nenhuma promessa de "FPS mágico", e tudo reversível.

## Funcionalidades

| Módulo | Status | O que faz |
| :--- | :---: | :--- |
| **System Specs** | ✅ | Lê CPU, GPUs (VRAM real via registro), RAM (tipo, frequência, nº de pentes), todos os discos (NVMe/SSD/HDD + saúde), placa-mãe, BIOS e Windows. Dá uma nota de 0 a 10 por componente. |
| **Driver Scan** | ✅ | Lista dispositivos com erro no Gerenciador de Dispositivos (com explicação do código de erro), drivers genéricos da Microsoft e drivers antigos pela **data real do driver instalado**. |
| **Driver Update** | ✅ | Atalhos para as páginas oficiais (NVIDIA, AMD, Intel, Realtek), filtrados pelo hardware real (ex.: não sugere driver de vídeo Intel para CPU linha F). |
| **Softwares pós-formatação** | ✅ | Catálogo pesquisável com 46 runtimes e programas essenciais e links oficiais. |
| **Instalação em lote (winget)** | ✅ | Marque vários programas (ou use o "Kit essencial") e instale todos de uma vez pelo winget, com fila, progresso e detecção do que já está instalado. |
| **Diagnóstico de erros / BSOD** | ✅ | Analisa 30 dias do Visualizador de Eventos (Kernel-Power 41, BugCheck 1001, WHEA, disco, crashes de apps), agrupa repetições e lista minidumps. |
| **Boost** | ✅ | Plano de energia, baixa latência NVIDIA/AMD, limpeza de RAM e de %TEMP% (com MB liberados reais), pausa de telemetria. Toda alteração fica registrada e pode ser **revertida**. |
| **Competitivo (input lag e consistência)** | ✅ | Monitor na taxa máxima (EnumDisplaySettings/ChangeDisplaySettingsEx), aceleração e velocidade 1:1 do mouse, teste de polling rate no navegador (pointerrawupdate), overlays em execução, plano Desempenho Máximo, suspensão seletiva de USB, teste de ping/jitter/perda com ajustes da placa de rede, guia de latência por GPU (Reflex/Anti-Lag/XeLL + limite de FPS para VRR) e uma seção de mitos de otimização. |
| **Prioridade de processos** | ✅ | Escolha um programa em execução e defina a prioridade de CPU, na hora ou de forma permanente (Image File Execution Options). |
| **Monitor em tempo real** | ✅ | Uso de CPU, GPU, RAM e disco com histórico, temperaturas (GPU NVIDIA, discos, ACPI) e processos que mais consomem. Um único PowerShell contínuo, para não pesar o PC. |
| **Programas na inicialização** | ✅ | Ativa/desativa pelo mesmo mecanismo do Gerenciador de Tarefas (StartupApproved), reversível. |
| **Ajustes de jogos do Windows** | ✅ | Modo de Jogo, HAGS, otimizações para jogos em janela e gravação em segundo plano do Game Bar. |
| **Diagnóstico de RAM** | ✅ | Detecta XMP/EXPO desligado, canal simples e pentes diferentes. |
| **Processos suspeitos** | ✅ | Escaneia todos os processos em execução e aponta os com sinais de malware (nome de processo do Windows fora do lugar, nomes disfarçados, pastas temporárias, sem assinatura, extensão dupla, padrão de minerador), explicando o que esse tipo de programa costuma fazer. Triagem, não antivírus. |
| **Ponto de restauração** | ✅ | Criado automaticamente antes da primeira alteração de sistema da sessão, ou manualmente pela aba Logs. |
| **Relatório exportável** | ✅ | Baixa um HTML com nota, hardware, drivers com problema e erros dos últimos 30 dias, pronto para enviar a um técnico. |
| **Atualizações do app** | ✅ | Consulta a última release no GitHub. |
| **Temas e preferências** | ✅ | Grafite (escuro) e Névoa (claro), com menu lateral recolhível (Ctrl+B). |


## Arquitetura

```
┌──────────────── Electron (janela) ────────────────┐
│  Frontend: HTML + CSS (BEMIT) + JavaScript puro   │
└──────────────┬────────────────────────────────────┘
               │ HTTP em 127.0.0.1 (cookie de sessão)
┌──────────────▼────────────────────────────────────┐
│  Servidor Node.js nativo (http, sem frameworks)    │
│  rotas → controllers → services                    │
└──────────────┬────────────────────────────────────┘
               │ PowerShell / WMI / CIM / registro / winget
            Windows
```

- **Zero dependências em produção:** o servidor usa só módulos nativos do Node.
- **Monitor eficiente:** um único processo PowerShell contínuo envia as métricas, em vez de abrir um processo por leitura.
- **Carregamento sob demanda:** cada aba só busca dados quando é aberta.
- **55 testes automatizados** (`node:test`) rodando no GitHub Actions a cada push.

## Segurança

O app roda como administrador, então a API local foi tratada como superfície de ataque:

| Ameaça | Proteção |
| :--- | :--- |
| Outro programa do PC usar o app elevado | Token aleatório por execução, entregue à janela num cookie `HttpOnly` + `SameSite=Strict` e comparado em tempo constante |
| Site malicioso chamando a API (CSRF / DNS rebinding) | Servidor só em `127.0.0.1`, listas de `Host` e `Origin` permitidos, POST exige JSON |
| Injeção de script na interface | Content-Security-Policy sem scripts inline; dados externos inseridos como texto |
| Injeção de comandos no PowerShell | Ações por lista fechada, parâmetros validados (booleanos, GUIDs, IDs do catálogo) |
| Links e arquivos | Apenas `http/https` abrem no navegador; bloqueio de *path traversal* nos arquivos estáticos |
| Abuso da janela | `contextIsolation`, sem `nodeIntegration`, DevTools desativado na versão distribuída |

## Como a nota do PC é calculada

| Componente | Peso | Critério |
| :--- | :---: | :--- |
| GPU | 35% | Faixa de desempenho por modelo (GTX 10 → RTX 50, RX 500 → RX 9000, Arc); VRAM como desempate |
| CPU | 30% | Núcleos/threads, família (i3…i9, Ryzen 3…9, Core Ultra) e geração |
| RAM | 20% | Capacidade, com penalidade para canal simples (1 pente) |
| Armazenamento | 15% | NVMe > SATA SSD > HDD; disco com falhas limita a nota |

É uma heurística para orientar o usuário, não um benchmark.

## Como usar

**Usuário:** baixe o `.exe` em [Releases](https://github.com/Filipiss/cwu-app/releases/latest) e execute. Ele é portátil, não precisa instalar. Algumas funções pedem administrador, e o próprio app oferece reabrir com permissão.

**Desenvolvimento:**

```bash
cd backend
npm install
npm run app            # abre o app (Electron)
npm start              # só o servidor, em http://127.0.0.1:4321
npm test               # testes
npm run dist:portable  # gera o .exe em release/
```

## Roadmap

- [ ] Contas de usuário com Supabase (salvar perfis e preferências)
- [ ] Análise de frame time com PresentMon
- [ ] Perfil gamer de um clique
- [ ] Encerrar programas em segundo plano antes de jogar
- [ ] Assinatura digital do executável

## Histórico

Veja o [CHANGELOG](CHANGELOG.md).

## Autor

Feito por **Filipi Soares Silva** — [LinkedIn](https://www.linkedin.com/in/SEU-LINKEDIN)
