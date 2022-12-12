describe('Home page', () => {
  it('successfully renders the Gatsby logo', () => {
    cy.visit('/')
    cy.get('[alt="Gatsby logo"]')
      .should('be.visible')
  })
})
