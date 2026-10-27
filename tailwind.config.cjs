module.exports = {
  content: ["./index.html", "./assets/js/**/*.js", "!./assets/js/data/**"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Space Grotesk", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        fintria: {
          navy: "#0B2545",
          navySoft: "#173257",
          verde: "#1F7A54",
          verdeBg: "#E4F5EC",
          azul: "#2A5FB0",
          azulBg: "#E7EEFA",
          ambar: "#B9791C",
          ambarBg: "#FBF0DD",
          roxo: "#6B4FA0",
          roxoBg: "#EFE9F7",
          vermelho: "#A63A2E",
          vermelhoBg: "#FBEAE6",
        },
      },
    },
  },
};
