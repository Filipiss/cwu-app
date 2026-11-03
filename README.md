# CWU App — Clean Windows Utility

> Assistente pós-formatação para Windows: diagnóstico de hardware, verificação de drivers, análise de telas azuis e otimizações reversíveis. Sem anúncios, sem telemetria, só links oficiais.

O CWU App junta num único executável portátil as tarefas que todo mundo faz depois de formatar um PC: descobrir o hardware, achar os drivers certos, instalar runtimes e entender por que o computador desligou sozinho.

---

## ✨ Funcionalidades

| Módulo | Status | O que faz |
| :--- | :---: | :--- |
| **System Specs** | ✅ | Lê CPU, GPUs (VRAM real via registro), RAM (tipo, frequência, nº de pentes), todos os discos (NVMe/SSD/HDD + saúde), placa-mãe, BIOS e Windows. Dá uma nota de 0 a 10 por componente. |
| **Driver Scan** | ✅ | Lista dispositivos com erro no Gerenciador de Dispositivos (com explicação do código de erro), drivers genéricos da Microsoft e drivers antigos pela **data real do driver instalado**. |
| **Driver Update** | ✅ | Atalhos para as páginas oficiais (NVIDIA, AMD, Intel, Realtek), filtrados pelo hardware real (ex.: não sugere driver de vídeo Intel para CPU linha F). |
| **Softwares pós-formatação** | ✅ | Catálogo pesquisável com 46 runtimes e programas essenciais e links oficiais. |
| **Instalação em lote (winget)** | ✅ | Marque vários programas (ou use o "Kit essencial") e instale todos de uma vez pelo winget, com fila, progresso e detecção do que já está instalado. |
| **Diagnóstico de erros / BSOD** | ✅ | Analisa 30 dias do Visualizador de Eventos (Kernel-Power 41, BugCheck 1001, WHEA, disco, crashes de apps), agrupa repetições e lista minidumps. |
| **Boost** | ✅ | Plano de energia, baixa latência NVIDIA/AMD, limpeza de RAM e de %TEMP% (com MB liberados reais), pausa de telemetria. Toda alteração fica registrada e pode ser **revertida**. |
| **Prioridade de processos** | ✅ | Escolha um programa em execução e defina a prioridade de CPU, na hora ou de forma permanente (Image File Execution Options). |
| **Monitor em tempo real** | ✅ | Uso de CPU, GPU, RAM e disco com histórico, temperaturas (GPU NVIDIA, discos, ACPI) e processos que mais consomem. Um único PowerShell contínuo, para não pesar o PC. |
| **Programas na inicialização** | ✅ | Ativa/desativa pelo mesmo mecanismo do Gerenciador de Tarefas (StartupApproved), reversível. |
| **Ajustes de jogos do Windows** | ✅ | Modo de Jogo, HAGS, otimizações para jogos em janela e gravação em segundo plano do Game Bar. |
| **Diagnóstico de RAM** | ✅ | Detecta XMP/EXPO desligado, canal simples e pentes diferentes. |
| **Processos suspeitos** | ✅ | Escaneia todos os processos em execução e aponta os com sinais de malware (nome de processo do Windows fora do lugar, nomes disfarçados, pastas temporárias, sem assinatura, extensão dupla, padrão de minerador), explicando o que esse tipo de programa costuma fazer. Triagem, não antivírus. |
| **Ponto de restauração** | ✅ | Criado automaticamente antes da primeira alteração de sistema da sessão, ou manualmente pela aba Logs. |
| **Relatório exportável** | ✅ | Baixa um HTML com nota, hardware, drivers com problema e erros dos últimos 30 dias, pronto para enviar a um técnico. |
| **Atualizações do app** | ✅ | Consulta a última release no GitHub. |
| **Temas e preferências** | ✅ | Futurista, Clássico e Light. |

---

## 🏛 Arquitetura

```
┌──────────────────────────────────────────────┐
│  Electron (janela nativa, executável portátil)│
│  └─ Frontend: HTML + JS puro + CSS em BEMIT   │
└───────────────┬──────────────────────────────┘
                │ HTTP local (127.0.0.1:4321)
┌───────────────▼──────────────────────────────┐
│  Backend Node.js (módulo http nativo)         │
│  routes → controllers → services              │
│  ├─ specsService   (CIM/WMI + registro)       │
│  ├─ driverService  (Win32_PnPSignedDriver)    │
│  ├─ logsService    (Get-WinEvent + minidumps) │
│  ├─ boostService   (powercfg, registro, Win32)│
│  ├─ wingetService  (fila de instalação)       │
│  ├─ restorePointService / reportService       │
│  └─ scoreCalculator                           │
└───────────────┬──────────────────────────────┘
                │ PowerShell via stdin (JSON)
┌───────────────▼──────────────────────────────┐
│  Windows: WMI/CIM, Registro, Event Log        │
│  Persistência: JSON em %APPDATA%\CWU-App      │
└──────────────────────────────────────────────┘
```

**Decisões de projeto**

- **Zero dependências em runtime.** O servidor usa o módulo `http` nativo do Node; só Electron e electron-builder são dependências de desenvolvimento.
- **Uma chamada de PowerShell por tela.** Cada `powershell.exe` custa ~0,5 s, então cada serviço coleta tudo num único script que devolve JSON.
- **Dados honestos.** Se uma leitura falha, a interface mostra "Não detectado" e o componente sai da média da nota. Nada é inventado.

### Segurança da API local

Um servidor em `localhost` pode ser chamado por qualquer site aberto no navegador. Para impedir que uma página externa dispare ações como encerrar processos:

- o servidor escuta somente em `127.0.0.1`;
- os cabeçalhos `Host` e `Origin` são validados (o que também protege contra DNS rebinding);
- não há CORS liberado e as requisições POST exigem `application/json` (força um preflight, que é recusado);
- as ações do Boost são validadas por lista de permissão, o corpo tem limite de 1 MB e as configurações aceitam só valores simples;
- arquivos estáticos têm proteção contra path traversal.

### Como a nota é calculada

| Componente | Peso | Critério |
| :--- | :---: | :--- |
| GPU | 35% | Faixa de desempenho por modelo (GTX 10 → RTX 50, RX 500 → RX 9000, Arc); VRAM como desempate |
| CPU | 30% | Núcleos/threads, família (i3…i9, Ryzen 3…9, Core Ultra) e geração |
| RAM | 20% | Capacidade, com penalidade para canal simples (1 pente) |
| Armazenamento | 15% | NVMe > SATA SSD > HDD; disco com falhas limita a nota |

É uma heurística para orientar o usuário, não um benchmark.

---

## 🎨 CSS em BEMIT

O frontend segue BEMIT (BEM + camadas do ITCSS): `1-settings` (tokens e temas) → `2-tools` → `3-generic` → `4-elements` → `5-objects` (`o-`) → `6-components` (`c-`) → `7-utilities` (`u-`).

---

## 🚀 Como usar

### Usuário final
Baixe o `CWU-App-Portable-x.y.z.exe` na página de Releases e execute. Algumas funções (minidumps, plano de energia, latência da GPU, telemetria) precisam que o app seja **executado como administrador**.

### Desenvolvimento
Requisitos: Windows 10/11 64-bit e Node.js 18+.

```bash
cd backend
npm install
npm run app            # abre a janela Electron
npm start              # apenas o servidor: http://127.0.0.1:4321
npm run dist:portable  # gera o .exe portátil em /release
npm test               # 37 testes (nota, parsers, eventos, winget, segurança, performance)
npm run check-winget   # valida no Windows se todos os IDs do winget existem
```

> **Docker:** um container Linux não acessa WMI, drivers nem o Visualizador de Eventos do Windows. A pasta `docker/` serve só para visualizar a interface; nesse modo, todas as leituras aparecem como "Não detectado".

---

## 🗺 Roadmap

- [x] Specs com VRAM real, todos os discos e saúde SMART básica
- [x] Varredura de drivers por data, código de erro e Hardware ID
- [x] Diagnóstico de BSOD e eventos com agrupamento
- [x] Boost com registro e reversão
- [x] API local protegida
- [x] Instalação em lote de softwares via `winget`
- [x] Ponto de restauração automático antes de otimizações
- [ ] Leitura do código de parada dentro dos minidumps
- [x] Relatório exportável (HTML)
- [x] Testes automatizados (node:test) e CI no GitHub Actions
- [ ] Alterar a baixa latência da NVIDIA direto pela NVAPI
- [ ] Migrar a comunicação HTTP para IPC do Electron

---

## 📄 Licença

MIT.
