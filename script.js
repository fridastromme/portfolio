const projectsButton = document.querySelector ('#projects__button');
const active = document.querySelector ('.active');

projectsButton.onclick = function () {
  projectsButton.style.color = '#0b2e99';
  projectsButton.style.backgroundColor = '#ffa9c6';
  projectsButton.style.padding = '0.5rem 1rem 0.5rem 1rem';
  projectsButton.style.marginRight = '2rem';
  active.style.color = '#ffa9c6';
  active.style.backgroundColor = '#0b2e99';
  active.style.padding = 'none';
  active.style.marginRight = '2rem';
};
