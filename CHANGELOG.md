# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [1.1.0] - 2026-11-10

### Adicionado
- Assistente IA: chat sobre hardware, software, configurações de jogos competitivos e periféricos custo-benefício, com respostas personalizadas pelo hardware lido em System Specs (exige login, 20 mensagens por dia)
- Sobreposição de desempenho (Alt + I): FPS e 1% low do jogo em primeiro plano (PresentMon), uso e temperatura de CPU e GPU e uso de RAM
- Sobreposição personalizável: 6 posições fixas ou posição livre arrastando na tela, layout vertical ou horizontal, tamanho e transparência
- Ícones ocultos: o X mantém o app aberto na bandeja do Windows, com menu para abrir, ligar a sobreposição ou sair (opção desligável)

### Corrigido
- Temperatura de placas de vídeo AMD (e Intel): agora lida pela mesma fonte do Gerenciador de Tarefas
- Temperatura de processadores AMD travada em valor fixo (ex.: 17 °C): leituras impossíveis ou paradas são descartadas, com explicação na tela
- Notificações do Windows apareciam como "Electron" em vez de "CWU App"

## [1.0.0] - 2026-11-09

### Adicionado
- System Specs: leitura real do hardware e nota de 0 a 10 por componente e para o PC
- Vida útil dos discos (SSD, NVMe e HD): desgaste, temperatura, horas ligado e erros sem correção, lidos do SMART
- Varredura de drivers com verificação real de atualizações (Windows Update e NVIDIA), ordenação por coluna e links oficiais
- Softwares pós-formatação: catálogo com links oficiais e instalação em lote via winget
- Boost Gamer: limpeza de memória, plano de energia, baixa latência NVIDIA/AMD e prioridade de processos
- Competitivo: monitor na taxa máxima, mouse 1:1, teste de polling rate, overlays, ping/jitter/perda, guia de latência por GPU e mitos de otimização
- Performance: monitor em tempo real com temperaturas, programas na inicialização, ajustes de jogos do Windows e diagnóstico de RAM
- Segurança: triagem de processos suspeitos, incluindo mineradores de criptomoedas
- Logs: erros do Windows (telas azuis, Kernel-Power) e histórico de ações do app, com filtros
- Ponto de restauração opcional (o app pergunta antes de alterar o sistema) e relatório do PC em HTML
- Confirmação antes de cada ação que altera o Windows
- Minha Conta: login e cadastro (Supabase) com lista pós-formatação personalizada salva na nuvem
- Temas Grafite e Névoa, português e inglês (troca na hora), menu lateral recolhível e aviso para reiniciar como administrador
