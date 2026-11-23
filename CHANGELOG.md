# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado
- Comandos de voz: com a escuta ligada (atalho Alt + H), fale "Ei app" e o comando, como "execute o boost", "ligue a sobreposição", "alinhe a sobreposição à direita superior" ou "ative o alto desempenho". Usa o reconhecimento de fala do próprio Windows, em português e sem internet; o áudio não sai do PC. O app confirma na tela e, se quiser, em voz alta
- Atalhos personalizáveis em Configurações › Preferências: troque o atalho da sobreposição e o dos comandos de voz. O app só aceita combinações que o Windows deixa usar (não em uso por outro programa)

## [1.3.2] - 2026-11-22

### Adicionado
- Configurações › Preferências: opção "Sempre iniciar o CWU App como administrador". Ao abrir, o Windows pede a permissão; se for negada, o app abre normalmente

### Alterado
- Em PCs com Modern Standby, o botão de desempenho de energia (Boost e Competitivo) agora liga o Modo de energia "Melhor desempenho", o mesmo de Configurações › Sistema › Energia, em vez de só avisar. Esses PCs não têm o plano Alto desempenho, então o app não troca de plano nem cria planos. O Reverter volta ao modo anterior

## [1.3.1] - 2026-11-22

### Corrigido
- Plano de energia (Boost e Competitivo): o app só troca para o plano Alto desempenho que já vem no Windows e nunca mais cria planos. Antes, o Boost criava uma cópia do plano "Desempenho Máximo" a cada clique
- Em PCs com Modern Standby (comum em notebooks e PCs mais novos), o app não troca mais o plano de energia, porque nesses PCs o Windows só suporta o Equilibrado e a troca podia travar o sistema. No lugar, indica o Modo de energia "Melhor desempenho" das Configurações
- O Boost dizia "ativado" mesmo quando o Windows recusava a troca de plano. Agora o app confere se o plano mudou de verdade e mostra o erro quando não muda

## [1.3.0] - 2026-11-16

### Adicionado
- Nova sub-aba Performance › Discos, que reúne espaço nas unidades, limpeza de disco e vida útil dos discos (que saiu do System Specs)
- Espaço nas unidades: espaço livre de cada unidade, com alerta abaixo de 15% e atalho para as configurações de Armazenamento
- Limpeza de disco: mede e apaga caches de shaders (NVIDIA, AMD, Intel e DirectX), temporários, despejos de travamento, downloads do Windows Update, cache da Otimização de Entrega, relatórios de erro, Lixeira e Windows.old. Também oferece desligar ou reduzir o arquivo de hibernação quando ele ocupa espaço sem uso. Você escolhe o que apagar e vê quanto foi liberado
- SysMain nos ajustes do Windows: mostra quando o serviço está desligado e permite reativar (desligar não acelera jogos em SSD e deixa o PC mais lento depois de ligar)
- Inicialização rápida do Windows nos ajustes: mostra se está ligada e permite ligar ou desligar
- Aviso quando um jogo está em tela cheia exclusiva de verdade, modo em que o Windows não mostra nada por cima do jogo
- Instalador completo: escolha entre instalar só para você ou para todos os usuários, escolha da pasta de instalação e uma página para escolher os atalhos (área de trabalho e menu Iniciar) e se o CWU App inicia com o Windows (nos ícones ocultos). As atualizações mantêm a pasta e as escolhas. Numa instalação para todos os usuários, "Voltar para uma versão anterior" não oferece as versões anteriores à 1.3.0, porque o instalador delas criaria uma segunda cópia do app
- Atualização dentro do app: um link já começa o download, com barra de progresso, tamanho, quanto já foi baixado, velocidade e tempo restante, e botões para pausar, parar e retomar. Pausar guarda o que foi baixado; parar descarta. O instalador é conferido (SHA-512) antes de aplicar

### Corrigido
- A sobreposição de desempenho (Alt + I) sumia em jogos em tela cheia: agora ela volta para cima do jogo sozinha, sem tirar o foco dele

## [1.2.2] - 2026-11-12

### Alterado
- A sobreposição de desempenho (Alt + I) usa as cores do tema escolhido: Grafite, Névoa ou Índigo
- Ícone de lua para o tema Índigo na escolha de temas

### Corrigido
- Instaladores baixados para voltar de versão eram deixados na pasta temporária do Windows; agora são apagados

## [1.2.1] - 2026-11-12

### Adicionado
- Tema Índigo: azul-marinho profundo com degradês, cartões de vidro azulado e acento azul vibrante
- O botão "Tema" do cabeçalho alterna entre os três temas

## [1.2.0] - 2026-11-12

### Adicionado
- Atualização automática: em "Novas Versões", o botão "Atualizar" baixa a versão nova, confere a integridade e aplica com "Reiniciar e aplicar"

### Alterado
- O CWU App agora é distribuído como instalador (CWU-App-Setup.exe): instala na pasta do usuário sem pedir administrador, com atalhos no menu Iniciar e na área de trabalho e desinstalação pelo Windows. As configurações do exe portátil anterior são mantidas

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
