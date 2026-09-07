(function (root) {
  const Lab = root.ColorLab;
  const controller = new Lab.ColorController();
  new Lab.ColorView(controller);
  root.colorLabController = controller;
})(globalThis);
