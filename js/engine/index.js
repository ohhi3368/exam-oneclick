/* 엔진 공개 API
 * 브라우저: window.MH.Engine / Node: module.exports
 */
(function (root) {
  'use strict';
  const MH = root.MH;
  MH.Engine = {
    compile: MH.solver.compile,
    parse: MH.poly.parse, lettersIn: MH.poly.lettersIn, ptex: MH.poly.ptex, xtex: MH.poly.xtex,
    describeSpec: MH.question.describeSpec, condText: MH.question.condText, targetText: MH.question.targetText,
    Fr: MH.num.Fr, QR: MH.num.QR, P: MH.poly.P, EngineError: MH.num.EngineError,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = MH.Engine;
})(typeof window !== 'undefined' ? window : globalThis);
