# AppSurf PR – Changelog

Site ao vivo: https://surfingbird.vercel.app
Repositório GitHub: https://github.com/agentworksia/surfingbird

## v1.2 – Gráfico interativo + ajustes mobile
- Cada hora do gráfico do dia agora é tocável: abre um card com altura, período, direção, vento e maré daquele horário (antes só existia tooltip no hover, que não funciona em celular)
- Cards de "Próximos dias" viraram acordeões: toque expande uma prévia hora a hora (6h, 9h, 12h, 15h, 18h, 21h)
- Suporte a teclado (Tab + Enter/Espaço) em todos os elementos interativos, com `aria-label` descritivo
- Ajustes de toque mobile: alvos de toque ≥40px, `touch-action: manipulation` (remove delay de 300ms), rolagem com inércia no gráfico, `-webkit-tap-highlight-color` removido, layout adaptado para telas ≤380px
- `theme-color` para a barra do navegador em mobile

## v1.1 – Maré
- Novo dado: altura de maré (`sea_level_height_msl`, Open-Meteo Marine API)
- Curva de maré desenhada junto com a curva de ondulação no gráfico do dia
- Chips de Preamar/Baixa-mar com horário e altura
- Card "Maré" no hero com seta de tendência (subindo/descendo)
- Maré passou a compor a nota de cada hora (28% ondulação, 20% período, 37% vento, 15% maré)
- Referência à Tábua de Marés oficial da Marinha do Brasil (DHN) na seção "Sobre os dados"

## v1.0 – Primeira versão
- Escolha de cidade (Matinhos, Ilha do Mel) e pico/praia dentro de cada cidade
- Classificação por hora em 5 níveis: Ótimo, Bom, Razoável, Ruim, Péssimo
- Fórmula: altura e período da ondulação + força/ângulo do vento relativo à orientação de cada praia
- Gráfico do dia (SVG) e grade de previsão de 6 dias
- Dados: Open-Meteo Marine API (NOAA WaveWatch III / GFS Wave) + Forecast API (vento)
- Design próprio: paleta náutica escura, tipografia Oswald/Inter/IBM Plex Mono

## Picos cadastrados hoje
- Matinhos: Pico de Matinhos (Praia Central), Praia Brava de Matinhos
- Ilha do Mel: Praia Grande (face oceânica), Farol das Conchas, Nova Brasília (baía)

## Próximos passos combinados (checklist de engajamento)
1. ~~Maré~~ ✅
2. Relatos da comunidade local (crowdsourced, com login simples)
3. Alertas push quando a condição ficar "ótima" (requer PWA)
4. Informações de acesso à Ilha do Mel (travessia de balsa)
5. PWA instalável + cache offline

## Nota sobre sincronização com GitHub
O repositório `lafraiarafael/appsurf` estava vazio e não havia credenciais configuradas para `git push` nem conector de GitHub disponível naquele momento. Esta versão foi publicada em `agentworksia/surfingbird`, com git e Vercel configurados nesta sessão.
