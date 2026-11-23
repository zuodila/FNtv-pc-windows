'use strict';
// 无边框窗口：顶部/左右拖动区 + 右上角嵌入式的三个窗口按钮（无贴片背景）。
// 关键：拖动条必须避开右上角按钮区(right:120px)，否则 -webkit-app-region:drag 会吞掉按钮点击。
module.exports = `
#__fntv_dragbar{
  position:fixed !important; top:0 !important; left:120px !important; right:140px !important;
  height:30px !important; z-index:2147483645 !important;
  -webkit-app-region:drag !important; -webkit-user-select:none !important;
  user-select:none !important; pointer-events:auto !important;
}
#__fntv_dragL,#__fntv_dragR{
  position:fixed !important; top:30px !important; bottom:0 !important;
  width:10px !important; z-index:2147483645 !important;
  -webkit-app-region:drag !important; pointer-events:auto !important;
}
#__fntv_dragL{ left:0 !important; }
#__fntv_dragR{ right:0 !important; }
#__fntv_ctrlbar{
  position:fixed !important; top:0 !important; right:8px !important;
  height:32px !important; z-index:2147483647 !important;
  display:flex !important; align-items:center !important; justify-content:flex-end !important;
  -webkit-app-region:no-drag !important; pointer-events:none !important;
  font-family:"Microsoft YaHei","PingFang SC",sans-serif !important; line-height:1 !important;
}
#__fntv_ctrlbar .fntv-box{
  pointer-events:auto !important; -webkit-app-region:no-drag !important;
  display:flex !important; align-items:center !important; height:32px !important;
  padding:0 4px !important; background:transparent !important; border:0 !important;
  box-shadow:none !important; border-radius:0 !important; margin:0 !important;
}
#__fntv_ctrlbar .fntv-btn{
  -webkit-app-region:no-drag !important; width:38px !important; height:32px !important;
  border:0 !important; background:transparent !important; color:#6b7583 !important;
  display:inline-flex !important; align-items:center !important; justify-content:center !important;
  cursor:pointer !important; padding:0 !important; font-size:13px !important;
  transition:background .15s,color .15s !important;
}
#__fntv_ctrlbar .fntv-btn:hover{ background:rgba(120,130,150,.22) !important; color:#333 !important; }
#__fntv_ctrlbar .fntv-close:hover{ background:#e81123 !important; color:#fff !important; }
#__fntv_ctrlbar .fntv-max.maxed span{ width:9px !important; height:9px !important; }
`;
