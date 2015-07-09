import expect from 'expect.js';

import { parse } from 'graphql/lib/language/parser';

import { Node } from '../dist/';

import {
  GraphQLObjectType,
  GraphQLString,
  Visitor
} from 'graphql';

describe.only('Node', () => {
  describe('#buildCypher', () => {
    it('handles a simple field', () => {
      let node = new Node({
        name: 'Person',
        description: 'Test',
        fields: () => ({
          name: 'string'
        })
      });
      let ast = parse('{ name }');
      let [cypher, newAst, ret] = node.buildCypher(ast, 'n');
      expect(cypher).to.equal('WITH { name: n.name } as n');
    });

    it('handles a predicate field', () => {
      let node = new Node({
        name: 'Person',
        description: 'Test',
        fields: () => ({
          id: {
            type: 'number',
            srcField: 'id(n)'
          }
        })
      });
      let ast = parse('{ id }');
      let [cypher, newAst, ret] = node.buildCypher(ast, 'n');
      expect(cypher).to.equal('WITH { id: id(n) } as n');
    });

    it('handles single nodes', () => {
      let Person = new Node({
        name: 'Person',
        description: 'Test',
        fields: () => ({
          name: {
            type: 'string',
            srcField: 'name'
          },
          onlyFriend: {
            type: Person,
            query: '(n)-[:IS_ONLY_FRIENDS_WITH]-(onlyFriend:Person)'
          }
        })
      });
      let ast = parse('{ name onlyFriend { name } }');
      let [cypher, newAst, ret] = Person.buildCypher(ast, 'n');
      expectCypher(cypher, `
        MATCH (n)-[:IS_ONLY_FRIENDS_WITH]-(nonlyFriend:Person)
        WITH { name: nonlyFriend.name } as nonlyFriend, n
        WITH { name: n.name, onlyFriend: nonlyFriend } as n
      `);
    });

    it('handles an array of related types', async () => {
      let Person = new Node({
        name: 'Person',
        description: 'Test',
        fields: () => ({
          name: {
            type: 'string',
            srcField: 'name'
          },
          friends: {
            type: [ Person ],
            query: '(n)-[:IS_FRIENDS_WITH]-(friends:Person)'
          }
        })
      });

      let ast = parse('{ name friends { name } }');
      let [cypher, newAst, ret] = Person.buildCypher(ast, 'n');
      expectCypher(cypher, `
        MATCH (n)-[:IS_FRIENDS_WITH]-(nfriends:Person)
        WITH { name: nfriends.name } as nfriends, n
        WITH { name: n.name, friends: COLLECT(nfriends) } as n
      `);
    });

    it('handles deeply nested types', () => {
      let Food = new Node({
        name: 'Food',
        description: 'A tasty treat',
        fields: () => ({ name: 'string' })
      });
      let Person = new Node({
        name: 'Person',
        description: 'Test',
        fields: () => ({
          name: {
            type: 'string',
            srcField: 'name'
          },
          friends: {
            type: [ Person ],
            query: '(n)-[:IS_FRIENDS_WITH]-(friends:Person)'
          },
          favoriteFoods: {
            type: [ Food ],
            query: '(n)-[:LIKES]->(favoriteFoods:Food)'
          }
        })
      });

      let graphQl = '{ name, friends { name, favoriteFoods { name } }}';
      let ast = parse(graphQl);
      let [cypher, newAst, ret] = Person.buildCypher(ast, 'n');
      expectCypher(cypher, `
        MATCH (n)-[:IS_FRIENDS_WITH]-(nfriends:Person)
        MATCH (nfriends)-[:LIKES]->(nfriendsfavoriteFoods:Food)
        WITH { name: nfriendsfavoriteFoods.name } as nfriendsfavoriteFoods, nfriends, n
        WITH { name: nfriends.name, favoriteFoods: COLLECT(nfriendsfavoriteFoods) } as nfriends, n
        WITH { name: n.name, friends: COLLECT(nfriends) } as n
      `);
    });
  });
});

function expectCypher(result, query) {
  expect(normalize(result)).to.be(normalize(query));

  function normalize(str) {
    return str.replace(/\n/g, ' ').replace(/ +/g, ' ').trim();
  }
}
