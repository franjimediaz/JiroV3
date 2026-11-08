import {
  Container,
  Hero,
  Heading,
  TextBlock,
  Columns,
  ButtonLink,
  Spacer,
} from "@repo/web-components";

export default function Home() {
  return (
    <Container as="main" maxWidth="wide">
      <Hero
        title="Jiro Web Static"
        subtitle="Generador de páginas web estáticas de Jiro V3. Una base sencilla para presentar tus ideas con claridad."
        button={{ text: "Explorar los componentes", href: "#componentes" }}
      />
      <Spacer size="large" />
      <Heading id="componentes" text="Una base compartida para tus páginas" />
      <TextBlock text="Combina contenido, estructura y estilos para crear páginas rápidas que se adaptan a cualquier pantalla." />
      <Spacer size="small" />
      <Columns columns={3}>
        <div>
          <Heading level={3} text="Contenido claro" />
          <TextBlock text="Títulos y textos con una jerarquía visual sencilla y una lectura cómoda." />
        </div>
        <div>
          <Heading level={3} text="Diseño adaptable" />
          <TextBlock text="Contenedores y columnas que organizan el contenido en escritorio y se apilan en móvil." />
        </div>
        <div>
          <Heading level={3} text="Publicación estática" />
          <TextBlock text="Páginas preparadas como HTML, con componentes reutilizables y estilos compartidos." />
        </div>
      </Columns>
      <Spacer size="medium" />
      <ButtonLink text="Volver al inicio" href="#" variant="outline" />
      <Spacer size="large" />
    </Container>
  );
}
