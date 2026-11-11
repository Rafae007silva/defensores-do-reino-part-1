// EDITE AQUI O CENÁRIO DO MAPA. Salve e atualize a página.
// quantidade: 0 = nenhum detalhe; 1 = normal; 2 = dobro; 3 = triplo.
// Use mostrar: false para esconder qualquer tipo de cenário.
// As opções valem para cada região (bioma), sem mudar as fases.
window.CENARIO_MAPA = {
  floresta: { fundo: "#3d7141", arvores: {mostrar:true, quantidade:1, cor:"#397c43"}, rios: {mostrar:false, quantidade:2, cor:"#4ba7c5", largura:14}, flores: {mostrar:false, quantidade:1, cor:"#ffe789"} },
  neve: { fundo: "#a4c7d4", pinheiros: {mostrar:true, quantidade:1, cor:"#597c79"}, rios: {mostrar:false, quantidade:1, cor:"#9edcf2", largura:12}, neveNoChao: {mostrar:true, quantidade:1} },
  rochas: { fundo: "#827b6c", pedras: {mostrar:true, quantidade:1, cor:"#4b514f"}, rios: {mostrar:false, quantidade:1, cor:"#65b2cb", largura:12} },
  penhascos: { fundo: "#685a63", montanhas: {mostrar:true, quantidade:1, cor:"#373342"}, rios: {mostrar:false, quantidade:1, cor:"#6aa9c4", largura:12} },
  lava: { fundo: "#5b2c2b", vulcoes: {mostrar:true, quantidade:1, cor:"#251b21"}, rios: {mostrar:false, quantidade:1, cor:"#ef5d22", largura:10} }
};
