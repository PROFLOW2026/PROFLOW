export const LINE_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
uniform vec2 u_pan;
uniform float u_zoom;
uniform vec2 u_viewport;
void main() {
  vec2 clip = vec2(
    (2.0 * (a_pos.x - u_pan.x) * u_zoom) / u_viewport.x,
    (2.0 * (a_pos.y - u_pan.y) * u_zoom) / u_viewport.y
  );
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

export const LINE_FRAG = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 outColor;
void main() {
  outColor = u_color;
}
`;
