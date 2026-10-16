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

/** Screen-space lineweight quads; width from u_lineWidthPx / u_zoom at draw time only. */
export const WIDE_LINE_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_p0;
layout(location = 1) in vec2 a_p1;
layout(location = 2) in float a_at_p1;
layout(location = 3) in float a_side;
uniform vec2 u_pan;
uniform float u_zoom;
uniform vec2 u_viewport;
uniform float u_lineWidthPx;
void main() {
  vec2 dir = a_p1 - a_p0;
  float len = length(dir);
  vec2 n = len > 1e-9 ? vec2(-dir.y, dir.x) / len : vec2(0.0, 1.0);
  vec2 base = mix(a_p0, a_p1, a_at_p1);
  float halfWorld = max(0.5, u_lineWidthPx) / max(u_zoom, 1e-6);
  vec2 world = base + n * a_side * halfWorld;
  vec2 clip = vec2(
    (2.0 * (world.x - u_pan.x) * u_zoom) / u_viewport.x,
    (2.0 * (world.y - u_pan.y) * u_zoom) / u_viewport.y
  );
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

export const FILL_VERT = `#version 300 es
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

export const RASTER_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;
uniform vec2 u_pan;
uniform float u_zoom;
uniform vec2 u_viewport;
out vec2 v_uv;
void main() {
  vec2 clip = vec2(
    (2.0 * (a_pos.x - u_pan.x) * u_zoom) / u_viewport.x,
    (2.0 * (a_pos.y - u_pan.y) * u_zoom) / u_viewport.y
  );
  gl_Position = vec4(clip, 0.0, 1.0);
  v_uv = a_uv;
}
`;

export const RASTER_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform vec4 u_color;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec4 tex = texture(u_texture, v_uv);
  outColor = vec4(tex.rgb * u_color.rgb, tex.a * u_color.a);
}
`;
