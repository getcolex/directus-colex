import { defineModule } from '@directus/extensions-sdk';
import ModuleComponent from './module.vue';

export default defineModule({
  id: 'review',
  name: 'Review',
  icon: 'rate_review',
  routes: [
    {
      path: '',
      component: ModuleComponent
    }
  ]
});
